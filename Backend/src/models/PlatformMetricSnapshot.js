const mongoose = require("mongoose");

const platformMetricSnapshotSchema = new mongoose.Schema(
    {
        snapshotDate: {
            type: Date,
            required: true,
            index: true,
        },
        period: {
            type: String,
            default: "daily",
            index: true,
        },
        revenue: {
            mrr: { type: Number, default: 0 },
            arr: { type: Number, default: 0 },
            lifetimeRevenueTotal: { type: Number, default: 0 },
            lifetimeRevenuePeriod: { type: Number, default: 0 },
            totalCollected: { type: Number, default: 0 },
            refundsTotal: { type: Number, default: 0 },
            netRevenue: { type: Number, default: 0 },
            byPlan: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        },
        growth: {
            totalTenants: { type: Number, default: 0 },
            activeTenants: { type: Number, default: 0 },
            trialTenants: { type: Number, default: 0 },
            pastDueTenants: { type: Number, default: 0 },
            suspendedTenants: { type: Number, default: 0 },
            cancelledTenants: { type: Number, default: 0 },
            newTenantsPeriod: { type: Number, default: 0 },
            churnedTenantsPeriod: { type: Number, default: 0 },
            logoChurnRate: { type: Number, default: 0 },
            netRevenueRetention: { type: Number, default: 100 },
        },
        mix: {
            byPlan: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
            byCycle: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
            lifetimeSeats: [
                {
                    planKey: String,
                    sold: Number,
                    cap: Number,
                },
            ],
        },
        health: {
            upsellCandidates: { type: Number, default: 0 },
            churnRisks: { type: Number, default: 0 },
            expiringTrialsCount: { type: Number, default: 0 },
            pastDueCount: { type: Number, default: 0 },
        },
        cost: {
            totalStorageBytes: { type: Number, default: 0 },
            totalWhatsAppMessagesPeriod: { type: Number, default: 0 },
            lifetimeFairUseViolations: { type: Number, default: 0 },
        },
    },
    { timestamps: true }
);

platformMetricSnapshotSchema.index({ snapshotDate: -1 });

try {
    module.exports = mongoose.model("PlatformMetricSnapshot");
} catch (_) {
    module.exports = mongoose.model("PlatformMetricSnapshot", platformMetricSnapshotSchema);
}
