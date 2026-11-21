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
            "package_refunded",
            "package_cancelled",
            "pt_refunded",
            "member_frozen",
            "member_created",
            "staff_created",
            "sales_abilities_updated",
            "upload_accessed",
            "phone_privacy_updated",
            "whatsapp_template_sent",
            "whatsapp_message_sent",
            "whatsapp_qr_sent",
            "platform_impersonation",
            "platform_staff_access_updated",
            "platform_staff_updated",
            "platform_staff_created",
            "platform_staff_deleted",
            "platform_location_created",
            "platform_location_updated",
            "platform_location_deleted",
            "tenant_status_updated",
            "plan_updated",
            "lifetime_purchased",
            "lifetime_upgraded",
            "lifetime_granted",
            "lifetime_revoked",
            "lifetime_price_changed",
            "entitlement_policy_updated",
            "bi_exported",
            "platform_analytics_exported",
            "location_created",
            "location_updated",
            "location_deleted",
            "role_access_updated",
            "role_changed",
            "access_updated",
            "user_area_access_updated",
            "staff_mobile_updated",
            "member_photo_uploaded",
            "member_photo_deleted",
            "package_transferred",
            "platform_user_created",
            "platform_user_updated",
            "platform_user_deleted",
            "plan_archived",
            "maintenance_mode_toggled",
            "tenant_purged",
            "tenant_billing_profile_updated",
            "tenant_marked_past_due",
            "tenant_dunning_suspended",
            "feature_rollout_updated",
            "contract_signed",
            "sale_created",
            "sale_refunded",
            "product_created",
            "product_updated",
            "stock_adjusted",
            "vendor_created",
            "vendor_updated",
            "vendor_payout_created",
            "vendor_payout_settled",
        ],
    },
    // "platform" rows record console actions that have no single gym (operators, plans, purges).
    scope: { type: String, enum: ["tenant", "platform"], default: "tenant", index: true },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        index: true,
        default: null,
        required: function () {
            return this.scope !== "platform";
        },
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    actorRole: { type: String, default: null },
    targetType: {
        type: String,
        enum: ["member", "user", "package_exception", "upload", "tenant", "plan", "location", "sale", "product", "vendor", "other"],
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
