const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

/**
 * Durable audit trail for sensitive mutations (exceptions, freezes, package assign, staff).
 * ProfileView remains the dedicated trail for profile reads.
 */
const auditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: [
            "package_exception_created",
            "package_exception_accepted",
            "package_exception_rejected",
            "package_assigned",
            "member_frozen",
            "member_created",
            "staff_created",
            "sales_abilities_updated",
            "upload_accessed",
            "phone_privacy_updated",
            "whatsapp_template_sent",
            "platform_impersonation",
            "tenant_status_updated",
            "plan_updated",
            "lifetime_purchased",
            "lifetime_upgraded",
            "lifetime_granted",
            "lifetime_revoked",
            "lifetime_price_changed",
            "entitlement_policy_updated",
        ],
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    actorRole: { type: String, default: null },
    targetType: {
        type: String,
        enum: ["member", "user", "package_exception", "upload", "tenant", "plan", "other"],
        default: "other",
    },
    targetId: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    requestId: { type: String, default: null },
}, { timestamps: true });

auditLogSchema.plugin(tenantPlugin);
auditLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
