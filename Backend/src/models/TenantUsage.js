const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

/**
 * Per-tenant usage meters. Queried from tenant requests (auto-scoped) or
 * platform ops under runAsPlatform with an explicit tenantId filter/upsert.
 */
const tenantUsageSchema = new mongoose.Schema(
    {
        memberCount: {
            type: Number,
            default: 0,
        },
        staffCount: {
            type: Number,
            default: 0,
        },
        branchCount: {
            type: Number,
            default: 1,
        },
        storageBytes: {
            type: Number,
            default: 0,
        },
        monthlyWhatsAppMessages: {
            type: Number,
            default: 0,
        },
        lastActivityAt: {
            type: Date,
            default: null,
        },
        refreshedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

tenantUsageSchema.plugin(tenantPlugin);
tenantUsageSchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.models.TenantUsage || mongoose.model("TenantUsage", tenantUsageSchema);
