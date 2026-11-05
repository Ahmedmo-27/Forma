const mongoose = require("mongoose");

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
            enum: ALL_FEATURES,
        }],
        allowedRoles: [{
            type: String,
            enum: ALL_ROLES,
        }],
        limits: {
            maxMembers: { type: Number, default: 500 },
            maxStaff: { type: Number, default: 10 },
            maxBranches: { type: Number, default: 1 },
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.models.Plan || mongoose.model("Plan", planSchema);
module.exports.ALL_FEATURES = ALL_FEATURES;
module.exports.ALL_ROLES = ALL_ROLES;
