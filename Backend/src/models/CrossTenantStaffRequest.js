const mongoose = require("mongoose");

/**
 * Platform-scoped queue: a gym wants to add staff whose phone/email
 * already belongs to a User at another tenant.
 */
const crossTenantStaffRequestSchema = new mongoose.Schema(
    {
        sourceUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        sourceTenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        sourceTenantName: { type: String, default: "" },
        sourceTenantSlug: { type: String, default: "", lowercase: true },
        sourceUserName: { type: String, default: "" },
        sourceUserEmail: { type: String, default: "" },
        sourceUserPhone: { type: String, default: "" },

        requestingTenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        requestingTenantName: { type: String, default: "" },
        requestingTenantSlug: { type: String, default: "", lowercase: true },
        requestedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        requestedByName: { type: String, default: "" },
        requestedByRole: { type: String, default: "" },

        proposedName: { type: String, default: "" },
        proposedEmail: { type: String, default: "" },
        proposedPhone: { type: String, default: "" },
        proposedRole: {
            type: String,
            required: true,
        },
        proposedCanAccessAllLocations: { type: Boolean, default: false },
        proposedAllowedLocationIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
        }],

        conflictField: {
            type: String,
            enum: ["phone", "email", "both"],
            default: "phone",
        },

        // What the requesting gym asked Forma support to do.
        preferredDecision: {
            type: String,
            enum: ["dual", "transfer"],
            required: true,
        },

        status: {
            type: String,
            enum: ["pending", "approved_dual", "approved_transfer", "rejected"],
            default: "pending",
            index: true,
        },
        adminNote: { type: String, default: "", maxlength: 2000 },
        decidedByPlatformUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null,
        },
        decidedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

crossTenantStaffRequestSchema.index({ status: 1, createdAt: -1 });
crossTenantStaffRequestSchema.index(
    { sourceUserId: 1, requestingTenantId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "pending" },
        name: "uniq_pending_staff_identity_per_source_requesting",
    }
);

module.exports =
    mongoose.models.CrossTenantStaffRequest
    || mongoose.model("CrossTenantStaffRequest", crossTenantStaffRequestSchema);
