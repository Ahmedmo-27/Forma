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
const { WHATSAPP_AUDIT_ACTIONS } = require("../utils/whatsappTracking");
const logger = require("../utils/logger");

/**
 * Explanations and calculation logic for each metric.
 */
const METRIC_DEFINITIONS = {
    mrr: "Monthly recurring revenue for tenants with status active. Monthly cycle uses the plan's monthly price. Yearly cycle uses the yearly price divided by 12. Lifetime licenses are excluded. The price stored on that day's snapshot is kept; a later price change does not rewrite older days unless that day is recomputed.",
    arr: "Annual recurring revenue: that day's MRR multiplied by 12. Lifetime revenue is not included.",
    lifetimeRevenueTotal: "Total collected on BillingEvent rows whose cycle is lifetime and whose type is purchase or upgrade.",
    netRevenue: "BillingEvent purchase and upgrade amounts minus refund amounts. This is Forma revenue, not gym-member sales.",
    logoChurnRate: "Tenants whose status is cancelled and whose updatedAt falls on this UTC day, divided by active tenants plus those same-day cancellations. This is a same-day count, not a stock of every cancelled gym.",
    netRevenueRetention: "Not calculated until two monthly snapshots exist. A blank value means the history is missing. It is not 100 by default.",
    upsellCandidates: "Tenants at or above 80% of the member limit. The live health list also checks the staff limit.",
    churnRisks: "Tenants with a recorded lastActivityAt older than 14 days. Gyms that have never recorded staff activity are counted as untracked, not as churned.",
    newTenantsPeriod: "Tenants whose createdAt falls on this UTC day.",
    tenantHealthScore: "25 points for status active or trial, 25 for a staff request in the last 7 days, 25 for at least one member on file, 25 for at least one staff user. Visit frequency is not in this score until gym snapshots are present.",
};

function tenantHealthScore({ status, lastActivityAt, memberCount, staffCount, now }) {
    let score = 0;
    if (status === "active" || status === "trial") score += 25;
    if (lastActivityAt && (now.getTime() - new Date(lastActivityAt).getTime()) <= 7 * 24 * 60 * 60 * 1000) score += 25;
    if (memberCount > 0) score += 25;
    if (staffCount > 0) score += 25;
    return score;
}

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
        let newTenantsPeriod = 0;
        let churnedTenantsPeriod = 0;
        let healthScoreTotal = 0;
        let untrackedActivity = 0;

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

            if (t.createdAt && new Date(t.createdAt) >= startOfDay && new Date(t.createdAt) <= endOfDay) {
                newTenantsPeriod += 1;
            }
            if (t.status === "cancelled" && t.updatedAt && new Date(t.updatedAt) >= startOfDay && new Date(t.updatedAt) <= endOfDay) {
                churnedTenantsPeriod += 1;
            }
            if (!t.lastActivityAt) untrackedActivity += 1;
            else if (new Date(t.lastActivityAt) < fourteenDaysAgo) churnRisks += 1;

            // Health: Capacity check (upsell candidate)
            const [memberCount, staffCount] = await Promise.all([
                Member.collection.countDocuments({ tenantId: t._id }),
                User.collection.countDocuments({ tenantId: t._id }),
            ]);

            const maxMembers = t.limitOverrides?.maxMembers || t.planId?.limits?.maxMembers || 500;
            if (maxMembers && memberCount >= maxMembers * 0.8) {
                upsellCandidates++;
            }
            healthScoreTotal += tenantHealthScore({
                status: t.status,
                lastActivityAt: t.lastActivityAt || null,
                memberCount,
                staffCount,
                now,
            });

            // Storage & Fair Use
            const bytes = await getTenantStorageBytes(t._id);
            totalStorageBytes += bytes;

            const isLifetime = cycle === "lifetime";
            const storageGb = bytes / (1024 * 1024 * 1024);
            const limitGb = t.limitOverrides?.storageGb != null
                ? t.limitOverrides.storageGb
                : (isLifetime
                    ? (t.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25)
                    : (t.planId?.fairUseCaps?.storageGb ?? 25));

            if (isLifetime && storageGb > limitGb) {
                lifetimeFairUseViolations++;
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
        const startingActive = Math.max(1, activeTenants + churnedTenantsPeriod);
        const logoChurnRate = Math.round((churnedTenantsPeriod / startingActive) * 10000) / 100;

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
                newTenantsPeriod,
                churnedTenantsPeriod,
                logoChurnRate,
                netRevenueRetention: null,
                nrrStatus: "insufficient_history",
            },
            mix: {
                byPlan,
                byCycle,
                lifetimeSeats,
            },
            health: {
                upsellCandidates,
                churnRisks,
                untrackedActivity,
                averageHealthScore: tenants.length ? Math.round(healthScoreTotal / tenants.length) : 0,
                expiringTrialsCount,
                pastDueCount,
            },
            cost: {
                totalStorageBytes,
                totalWhatsAppMessagesPeriod: await AuditLog.countDocuments({
                    action: { $in: WHATSAPP_AUDIT_ACTIONS },
                    createdAt: { $gte: startOfDay, $lte: endOfDay },
                }),
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
    tenantHealthScore,
};
