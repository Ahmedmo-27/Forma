const mongoose = require("mongoose");
const { encryptSecret, decryptSecret } = require("../utils/tenantCrypto");

const brandingSchema = new mongoose.Schema(
    {
        logoKey: { type: String, default: null }, // Storage key, e.g. "tenant-123/branding/logo.png"
        displayName: { type: String, default: null },
        palette: {
            primary: { type: String, default: "#44298C" },
            secondary: { type: String, default: "#5B38BA" },
            accent: { type: String, default: "#6D47CC" },
            background: { type: String, default: "#F4F5F7" },
            text: { type: String, default: "#111827" },
        },
    },
    { _id: false }
);

const localeSchema = new mongoose.Schema(
    {
        currency: { type: String, default: "EGP", uppercase: true },
        timezone: { type: String, default: "Africa/Cairo" },
        language: { type: String, default: "en" },
    },
    { _id: false }
);

const whatsappSettingsSchema = new mongoose.Schema(
    {
        phoneNumberId: { type: String, default: null },
        businessAccountId: { type: String, default: null },
        accessToken: { type: String, default: null }, // Encrypted at rest (AES-256-GCM)
    },
    { _id: false }
);

const tenantSettingsSchema = new mongoose.Schema(
    {
        branding: { type: brandingSchema, default: () => ({}) },
        locale: { type: localeSchema, default: () => ({}) },
        enabledActivities: {
            type: [String],
            default: ["gym", "crossfit", "box", "mma", "kickboxing", "calisthenics"],
        },
        whatsapp: { type: whatsappSettingsSchema, default: () => ({}) },
        featureConfig: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    },
    { _id: false }
);

const tenantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["trial", "active", "past_due", "suspended", "cancelled"],
            default: "trial",
            index: true,
        },
        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Plan",
            required: true,
        },
        featureOverrides: {
            add: [{ type: String }],
            remove: [{ type: String }],
        },
        limitOverrides: {
            maxMembers: { type: Number, default: null },
            maxStaff: { type: Number, default: null },
            maxBranches: { type: Number, default: null },
        },
        trialEndsAt: {
            type: Date,
            default: null,
        },
        currentPeriodEnd: {
            type: Date,
            default: null,
        },
        billingProviderCustomerId: {
            type: String,
            default: null,
        },
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        dbUri: {
            type: String,
            default: null, // Reserved for future dedicated database mode
        },
        settings: {
            type: tenantSettingsSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

// Pre-save hook: auto-encrypt WhatsApp access token if updated and plaintext
tenantSchema.pre("save", function () {
    if (this.settings?.whatsapp?.accessToken) {
        const token = this.settings.whatsapp.accessToken;
        // Check if token is already in iv:tag:cipher format (hex with 2 colons)
        const parts = token.split(":");
        const isEncrypted = parts.length === 3 && parts.every((p) => /^[a-f0-9]+$/i.test(p));
        if (!isEncrypted) {
            this.settings.whatsapp.accessToken = encryptSecret(token);
        }
    }
});

// Decrypt WhatsApp credentials for internal messaging operations
tenantSchema.methods.getDecryptedWhatsApp = function () {
    const wa = this.settings?.whatsapp;
    if (!wa) return null;
    return {
        phoneNumberId: wa.phoneNumberId,
        businessAccountId: wa.businessAccountId,
        accessToken: wa.accessToken ? decryptSecret(wa.accessToken) : null,
    };
};

/**
 * Returns effective features: plan.features + overrides.add - overrides.remove
 */
function getEffectiveFeatures(tenant, plan) {
    const baseFeatures = new Set(plan?.features || []);
    const add = tenant?.featureOverrides?.add || [];
    const remove = new Set(tenant?.featureOverrides?.remove || []);

    add.forEach((f) => baseFeatures.add(f));
    remove.forEach((f) => baseFeatures.delete(f));

    return Array.from(baseFeatures);
}

/**
 * Returns effective limits applying limitOverrides over plan.limits
 */
function getEffectiveLimits(tenant, plan) {
    const planLimits = plan?.limits || { maxMembers: 500, maxStaff: 10, maxBranches: 1 };
    const overrides = tenant?.limitOverrides || {};

    return {
        maxMembers: overrides.maxMembers != null ? overrides.maxMembers : planLimits.maxMembers,
        maxStaff: overrides.maxStaff != null ? overrides.maxStaff : planLimits.maxStaff,
        maxBranches: overrides.maxBranches != null ? overrides.maxBranches : planLimits.maxBranches,
    };
}

module.exports = mongoose.model("Tenant", tenantSchema);
module.exports.getEffectiveFeatures = getEffectiveFeatures;
module.exports.getEffectiveLimits = getEffectiveLimits;
