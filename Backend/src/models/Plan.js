const mongoose = require("mongoose");
const { enforceEgpCurrency } = require("./forceEgp");

const { FEATURE_KEYS } = require("../config/featureRegistry");

/** Every feature key a plan can include. Defined in config/featureRegistry. */
const ALL_FEATURES = [...FEATURE_KEYS];

/** Plan keys are free-form slugs so super admin can create any tier. */
const PLAN_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;

const ALL_ROLES = [
    "Owner",
    "Receptionist",
    "Coach",
    "Head Coach",
    "Accountant",
    "Sales",
    "Sales Manager",
    "General Manager",
];

const planSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            match: [PLAN_KEY_PATTERN, "Plan key must be 2-32 lowercase letters, numbers, hyphens or underscores"],
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        priceMonthly: {
            type: Number,
            required: true,
            min: 0,
        },
        priceYearly: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "EGP",
            uppercase: true,
            trim: true,
        },
        features: [{
            type: String,
        }],
        allowedRoles: [{
            type: String,
        }],
        limits: {
            maxMembers: { type: Number, default: 500 },
            maxStaff: { type: Number, default: 10 },
            maxBranches: { type: Number, default: 1 },
        },
        fairUseCaps: {
            storageGb: { type: Number, default: 25 },
            whatsappMessagesMonthly: { type: Number, default: 2000 },
        },
        visibility: {
            type: String,
            enum: ["public", "hidden", "archived"],
            default: "public",
            index: true,
        },
        // Highlighted on the public pricing page.
        featured: {
            type: Boolean,
            default: false,
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
        description: {
            type: String,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

enforceEgpCurrency(planSchema);

try {
    module.exports = mongoose.model("Plan");
} catch (_) {
    module.exports = mongoose.model("Plan", planSchema);
}
module.exports.ALL_FEATURES = ALL_FEATURES;
module.exports.ALL_ROLES = ALL_ROLES;
module.exports.PLAN_KEY_PATTERN = PLAN_KEY_PATTERN;
