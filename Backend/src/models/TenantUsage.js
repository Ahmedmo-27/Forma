const mongoose = require("mongoose");

const tenantUsageSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            unique: true,
            index: true,
        },
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

try {
    module.exports = mongoose.model("TenantUsage");
} catch (_) {
    module.exports = mongoose.model("TenantUsage", tenantUsageSchema);
}
