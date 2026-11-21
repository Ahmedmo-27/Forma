const mongoose = require("mongoose");

/**
 * Platform-scoped queue of tenant requests to trial a plan feature
 * they do not currently have. Approved rows also write Tenant.featureTrials.
 */
const featureTrialRequestSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        tenantName: { type: String, default: "" },
        tenantSlug: { type: String, default: "", lowercase: true },
        featureKey: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        featureName: { type: String, default: "" },
        requestedDurationValue: {
            type: Number,
            required: true,
            min: 1,
        },
        requestedDurationUnit: {
            type: String,
            enum: ["days", "weeks"],
            required: true,
        },
        requestedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        requestedByName: { type: String, default: "" },
        requestedByRole: { type: String, default: "" },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "cancelled"],
            default: "pending",
            index: true,
        },
        adminNote: { type: String, default: "", maxlength: 2000 },
        approvedDurationValue: { type: Number, default: null, min: 1 },
        approvedDurationUnit: {
            type: String,
            enum: ["days", "weeks", null],
            default: null,
        },
        decidedByPlatformUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null,
        },
        decidedAt: { type: Date, default: null },
        trialStartsAt: { type: Date, default: null },
        trialEndsAt: { type: Date, default: null },
    },
    { timestamps: true }
);

featureTrialRequestSchema.index({ status: 1, createdAt: -1 });
featureTrialRequestSchema.index(
    { tenantId: 1, featureKey: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "pending" },
        name: "uniq_pending_feature_trial_per_tenant",
    }
);

module.exports =
    mongoose.models.FeatureTrialRequest ||
    mongoose.model("FeatureTrialRequest", featureTrialRequestSchema);
