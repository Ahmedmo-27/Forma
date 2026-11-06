const mongoose = require("mongoose");
const { enforceEgpCurrency } = require("./forceEgp");

const ALL_FEATURES = [
    "members",
    "checkin",
    "packages",
    "pt_tracking",
    "audit",
    "accounting",
    "exception_approvals",
    "sales_crm",
    "whatsapp",
    "excel_import",
    "exec_analytics",
    "funnels",
    "business_intelligence",
];

const ALL_ROLES = [
    "Owner",
    "Receptionist",
    "Coach",
    "Coach Manager",
    "Accountant",
    "Sales",
    "Sales Manager",
];

const planSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            enum: ["basic", "gold", "platinum"],
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
