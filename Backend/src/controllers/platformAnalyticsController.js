const PlatformMetricSnapshot = require("../models/PlatformMetricSnapshot");
const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const platformAnalyticsService = require("../services/platformAnalyticsService");
const { getTenantStorageBytes } = require("./platformTenantController");
const { runAsPlatform } = require("../context/tenantContext");
const { WHATSAPP_AUDIT_ACTIONS } = require("../utils/whatsappTracking");
const logger = require("../utils/logger");

/**
 * Get Business Overview Dashboard
 * GET /api/platform/analytics/overview
 */
async function getOverview(req, res) {
    try {
        const result = await platformAnalyticsService.getLatestMetrics();
        res.json(result);
    } catch (err) {
        logger.error("platform", "getOverview error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Get Time-Series Metric Snapshots for Charts
 * GET /api/platform/analytics/snapshots
 */
async function getSnapshots(req, res) {
    try {
        const { fromDate, toDate, limit = 30 } = req.query;
        const filter = { period: "daily" };

        if (fromDate || toDate) {
            filter.snapshotDate = {};
            if (fromDate) filter.snapshotDate.$gte = new Date(fromDate);
            if (toDate) filter.snapshotDate.$lte = new Date(toDate);
        }

        const snapshots = await PlatformMetricSnapshot.find(filter)
            .sort({ snapshotDate: 1 })
            .limit(Math.min(365, parseInt(limit, 10)));

        res.json(snapshots);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Get Upsell Candidates & Inactive Gyms Churn Risk Lists
 * GET /api/platform/analytics/health-details
 */
async function getUpsellAndChurnLists(req, res) {
    try {
        return runAsPlatform(async () => {
            const tenants = await Tenant.find({ isSoftDeleted: { $ne: true }, status: { $in: ["trial", "active"] } })
                .populate("planId", "key name limits")
                .populate("ownerUserId", "name email");

            const now = new Date();
            const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

            const upsellCandidates = [];
            const churnRisks = [];

            for (const t of tenants) {
                const [memberCount, staffCount] = await Promise.all([
                    Member.collection.countDocuments({ tenantId: t._id }),
                    User.collection.countDocuments({ tenantId: t._id }),
                ]);

                const maxMembers = t.limitOverrides?.maxMembers || t.planId?.limits?.maxMembers || 500;
                const maxStaff = t.limitOverrides?.maxStaff || t.planId?.limits?.maxStaff || 10;

                const memberRatio = maxMembers ? memberCount / maxMembers : 0;
                const staffRatio = maxStaff ? staffCount / maxStaff : 0;

                if (memberRatio >= 0.8 || staffRatio >= 0.8) {
                    upsellCandidates.push({
                        id: t._id,
                        name: t.name,
                        slug: t.slug,
                        plan: t.planId?.name,
                        memberCount,
                        maxMembers,
                        staffCount,
                        maxStaff,
                        capacityPercent: Math.round(Math.max(memberRatio, staffRatio) * 100),
                    });
                }

                const lastActivity = t.lastActivityAt || null;
                const healthScore = platformAnalyticsService.tenantHealthScore({
                    status: t.status,
                    lastActivityAt: lastActivity,
                    memberCount,
                    staffCount,
                    now,
                });
                if (lastActivity && lastActivity < fourteenDaysAgo) {
                    const daysInactive = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000));
                    churnRisks.push({
                        id: t._id,
                        name: t.name,
                        slug: t.slug,
                        plan: t.planId?.name,
                        lastActivityAt: lastActivity,
                        daysInactive,
                        healthScore,
                        owner: t.ownerUserId ? { name: t.ownerUserId.name, email: t.ownerUserId.email } : null,
                    });
                }
            }

            res.json({
                upsellCandidates: upsellCandidates.sort((a, b) => b.capacityPercent - a.capacityPercent),
                churnRisks: churnRisks.sort((a, b) => b.daysInactive - a.daysInactive),
            });
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Get Cost & Top Consumers (Storage & WhatsApp)
 * GET /api/platform/analytics/cost-insights
 */
async function getCostInsights(req, res) {
    try {
        return runAsPlatform(async () => {
            const tenants = await Tenant.find({ isSoftDeleted: { $ne: true } })
                .populate("planId", "key name fairUseCaps")
                .select("name slug billing limitOverrides planId");

            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

            const consumers = await Promise.all(
                tenants.map(async (t) => {
                    const storageBytes = await getTenantStorageBytes(t._id);
                    const whatsappMonthly = await AuditLog.countDocuments({
                        tenantId: t._id,
                        action: { $in: WHATSAPP_AUDIT_ACTIONS },
                        createdAt: { $gte: monthStart },
                    });

                    const isLifetime = t.billing?.cycle === "lifetime";
                    const storageGb = storageBytes / (1024 * 1024 * 1024);
                    const storageLimitGb = t.limitOverrides?.storageGb != null
                        ? t.limitOverrides.storageGb
                        : (isLifetime
                            ? (t.billing?.lifetime?.fairUseLimits?.storageGbLimit || 25)
                            : (t.planId?.fairUseCaps?.storageGb ?? 25));
                    const isStorageOverCap = storageLimitGb ? storageGb > storageLimitGb : false;

                    return {
                        id: t._id,
                        name: t.name,
                        slug: t.slug,
                        cycle: t.billing?.cycle || "monthly",
                        storageBytes,
                        storageMb: Math.round((storageBytes / (1024 * 1024)) * 100) / 100,
                        storageLimitGb,
                        whatsappMonthly,
                        isLifetime,
                        isStorageOverCap,
                    };
                })
            );

            // Sort top consumers
            const topStorage = [...consumers].sort((a, b) => b.storageBytes - a.storageBytes).slice(0, 10);
            const topWhatsApp = [...consumers].sort((a, b) => b.whatsappMonthly - a.whatsappMonthly).slice(0, 10);
            const fairUseOverages = consumers.filter((c) => c.isStorageOverCap);
            const totalStorageBytes = consumers.reduce((acc, c) => acc + (c.storageBytes || 0), 0);

            res.json({
                topStorage,
                topWhatsApp,
                fairUseOverages,
                totalStorageBytes,
            });
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Trigger Metric Snapshot Computation
 * POST /api/platform/analytics/snapshots/compute
 */
async function triggerSnapshot(req, res) {
    try {
        const date = req.body?.date ? new Date(req.body.date) : new Date();
        const snapshot = await platformAnalyticsService.computeDailySnapshot(date);
        res.json({ message: "Snapshot computed successfully", snapshot });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Export Historical Analytics Snapshots to CSV
 * GET /api/platform/analytics/export
 */
async function exportAnalyticsCsv(req, res) {
    try {
        const snapshots = await PlatformMetricSnapshot.find().sort({ snapshotDate: -1 });

        let csv = "Date,MRR,ARR,Lifetime Revenue,Total Collected,Total Refunds,Net Revenue,Active Tenants,Trial Tenants,Past Due,Suspended,Cancelled,Logo Churn Rate,Storage MB\n";
        for (const s of snapshots) {
            const dateStr = new Date(s.snapshotDate).toISOString().split("T")[0];
            const storageMb = Math.round((s.cost?.totalStorageBytes || 0) / (1024 * 1024));
            csv += `${dateStr},${s.revenue.mrr},${s.revenue.arr},${s.revenue.lifetimeRevenueTotal},${s.revenue.totalCollected},${s.revenue.refundsTotal},${s.revenue.netRevenue},${s.growth.activeTenants},${s.growth.trialTenants},${s.growth.pastDueTenants},${s.growth.suspendedTenants},${s.growth.cancelledTenants},${s.growth.logoChurnRate}%,${storageMb}\n`;
        }

        logger.info("platform", "platform_analytics_exported", {
            actor: req.platformUser?.id || null,
            rows: snapshots.length,
        });
        if (req.platformUser?.id) {
            try {
                await runAsPlatform(() => AuditLog.create({
                    tenantId: req.platformUser.id,
                    action: "platform_analytics_exported",
                    actor: req.platformUser.id,
                    actorRole: req.platformUser.role || "PlatformUser",
                    targetType: "other",
                    meta: { rows: snapshots.length },
                }));
            } catch (auditError) {
                logger.info("platform", "platform export audit skipped", { error: auditError.message });
            }
        }
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="platform-analytics-snapshots.csv"');
        res.setHeader("Cache-Control", "private, no-store");
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getOverview,
    getSnapshots,
    getUpsellAndChurnLists,
    getCostInsights,
    triggerSnapshot,
    exportAnalyticsCsv,
};
