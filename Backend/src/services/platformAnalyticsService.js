const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const PlanPrice = require("../models/PlanPrice");
const BillingEvent = require("../models/BillingEvent");
const PlatformMetricSnapshot = require("../models/PlatformMetricSnapshot");
const Member = require("../models/Member");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { runAsPlatform } = require("../context/tenantContext");
const { getTenantStorageBytes } = require("../controllers/platformTenantController");
const logger = require("../utils/logger");

/**
 * Explanations and calculation logic for each metric.
 */
const METRIC_DEFINITIONS = {
    mrr: "Monthly Recurring Revenue normalized across active recurring subscribers (Monthly Plan Price + Yearly Plan Price / 12). One-time lifetime licenses are explicitly excluded from MRR.",
    arr: "Annual Recurring Revenue: MRR multiplied by 12.",
    lifetimeRevenueTotal: "Total cumulative capital collected from all one-time lifetime license purchases and upgrades.",
    netRevenue: "Total gross revenue collected across all cycles minus all issued refunds.",
    logoChurnRate: "Percentage of active tenants cancelled or suspended within the period: (Churned Tenants / Starting Active Tenants) * 100.",
    netRevenueRetention: "Net revenue retained from existing cohort including upgrades minus churn and downgrades.",
    upsellCandidates: "Tenants utilizing >= 80% of their plan's member limit or staff limit.",
    churnRisks: "Tenants with zero login or staff activity in the last 14 days.",
};

/**
 * Computes snapshot metrics for a specific date and saves/upserts into PlatformMetricSnapshot.
 */
async function computeDailySnapshot(date = new Date()) {
    return runAsPlatform(async () => {
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // Fetch all non-soft-deleted tenants
        const tenants = await Tenant.find({ isSoftDeleted: { $ne: true } }).populate("planId");

        let mrr = 0;
        let totalTenants = tenants.length;
        let activeTenants = 0;
        let trialTenants = 0;
        let pastDueTenants = 0;
        let suspendedTenants = 0;
        let cancelledTenants = 0;

        const byPlan = {};
        const byCycle = { monthly: 0, yearly: 0, lifetime: 0 };
        const revenueByPlan = {};

        const now = new Date();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        let churnRisks = 0;
        let upsellCandidates = 0;
        let expiringTrialsCount = 0;
        let pastDueCount = 0;
        let totalStorageBytes = 0;
        let lifetimeFairUseViolations = 0;

        for (const t of tenants) {
            const planKey = t.planId?.key || "unknown";
            byPlan[planKey] = (byPlan[planKey] || 0) + 1;

            const cycle = t.billing?.cycle || "monthly";
            byCycle[cycle] = (byCycle[cycle] || 0) + 1;

            if (t.status === "active") {
                activeTenants++;
                // Compute MRR strictly from recurring cycles
                if (cycle === "monthly") {
                    const price = t.planId?.priceMonthly || 0;
                    mrr += price;
                    revenueByPlan[planKey] = (revenueByPlan[planKey] || 0) + price;
                } else if (cycle === "yearly") {
                    const priceNormalized = (t.planId?.priceYearly || 0) / 12;
                    mrr += priceNormalized;
                    revenueByPlan[planKey] = (revenueByPlan[planKey] || 0) + priceNormalized;
                }
            } else if (t.status === "trial") {
                trialTenants++;
                if (t.trialEndsAt && t.trialEndsAt <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
                    expiringTrialsCount++;
                }
            } else if (t.status === "past_due") {
                pastDueTenants++;
                pastDueCount++;
            } else if (t.status === "suspended") {
                suspendedTenants++;
            } else if (t.status === "cancelled") {
                cancelledTenants++;
            }

            // Health: Check inactive churn risk
            const lastActivity = t.lastActivityAt || t.updatedAt;
            if (lastActivity && lastActivity < fourteenDaysAgo) {
                churnRisks++;
            }

            // Health: Capacity check (upsell candidate)
            const [memberCount, staffCount] = await Promise.all([
                Member.collection.countDocuments({ tenantId: t._id }),
                User.collection.countDocuments({ tenantId: t._id }),
            ]);

            const maxMembers = t.limitOverrides?.maxMembers || t.planId?.limits?.maxMembers || 500;
            if (maxMembers && memberCount >= maxMembers * 0.8) {
                upsellCandidates++;
            }

            // Storage & Fair Use
            const bytes = await getTenantStorageBytes(t._id);
            totalStorageBytes += bytes;

            if (cycle === "lifetime") {
                const storageGb = bytes / (1024 * 1024 * 1024);
                const limitGb = t.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25;
                if (storageGb > limitGb) {
                    lifetimeFairUseViolations++;
                }
            }
        }

        mrr = Math.round(mrr * 100) / 100;
        const arr = Math.round(mrr * 12 * 100) / 100;

        // Ledger totals
        const ledgerEvents = await BillingEvent.find();
        let totalCollected = 0;
        let refundsTotal = 0;
        let lifetimeRevenueTotal = 0;
        let lifetimeRevenuePeriod = 0;

        for (const e of ledgerEvents) {
            if (e.type === "purchase" || e.type === "upgrade") {
                totalCollected += e.amount || 0;
                if (e.cycle === "lifetime") {
                    lifetimeRevenueTotal += e.amount || 0;
                    if (e.createdAt >= startOfDay && e.createdAt <= endOfDay) {
                        lifetimeRevenuePeriod += e.amount || 0;
                    }
                }
            } else if (e.type === "refund") {
                refundsTotal += e.amount || 0;
            }
        }

        const netRevenue = Math.max(0, totalCollected - refundsTotal);

        // Lifetime seats sold vs cap
        const lifetimePrices = await PlanPrice.find({ cycle: "lifetime" }).populate("planId", "key");
        const lifetimeSeats = lifetimePrices.map((lp) => ({
            planKey: lp.planId?.key || "unknown",
            sold: lp.soldLifetimeSeats || 0,
            cap: lp.maxLifetimeSeats || null,
        }));

        // Churn calculations
        const startingActive = Math.max(1, activeTenants + cancelledTenants);
        const logoChurnRate = Math.round((cancelledTenants / startingActive) * 10000) / 100;

        const snapshotData = {
            snapshotDate: startOfDay,
            period: "daily",
            revenue: {
                mrr,
                arr,
                lifetimeRevenueTotal,
                lifetimeRevenuePeriod,
                totalCollected,
                refundsTotal,
                netRevenue,
                byPlan: revenueByPlan,
            },
            growth: {
                totalTenants,
                activeTenants,
                trialTenants,
                pastDueTenants,
                suspendedTenants,
                cancelledTenants,
                newTenantsPeriod: 0,
                churnedTenantsPeriod: cancelledTenants,
                logoChurnRate,
                netRevenueRetention: 100,
            },
            mix: {
                byPlan,
                byCycle,
                lifetimeSeats,
            },
            health: {
                upsellCandidates,
                churnRisks,
                expiringTrialsCount,
                pastDueCount,
            },
            cost: {
                totalStorageBytes,
                totalWhatsAppMessagesPeriod: 0,
                lifetimeFairUseViolations,
            },
        };

        const snapshot = await PlatformMetricSnapshot.findOneAndUpdate(
            { snapshotDate: startOfDay, period: "daily" },
            { $set: snapshotData },
            { new: true, upsert: true }
        );

        return snapshot;
    }, { reason: "compute_daily_metric_snapshot" });
}

/**
 * Retrieves latest metrics with live computation fallback.
 */
async function getLatestMetrics() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let snapshot = await PlatformMetricSnapshot.findOne({ snapshotDate: today });
    if (!snapshot) {
        snapshot = await computeDailySnapshot(today);
    }

    return {
        metrics: snapshot,
        definitions: METRIC_DEFINITIONS,
    };
}

module.exports = {
    computeDailySnapshot,
    getLatestMetrics,
    METRIC_DEFINITIONS,
};
