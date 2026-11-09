const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const SENDABLE_ROLES = [
    "Owner",
    "Sales Manager",
    "Sales",
    "Receptionist",
    "Accountant",
    "Coach",
    "Coach Manager",
    "General Manager",
];

const whatsAppTemplateSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        // Builtin: "packages" | "discounts"; any other string is a custom free-text type
        type: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        introText: {
            type: String,
            default: "",
            trim: true,
        },

        bodyText: {
            type: String,
            default: "",
            trim: true,
        },

        introTextAr: {
            type: String,
            default: "",
            trim: true,
        },

        bodyTextAr: {
            type: String,
            default: "",
            trim: true,
        },

        // For packages/discounts: append live catalog / discount lines
        includeLiveData: {
            type: Boolean,
            default: true,
        },

        // Default package ids suggested when composing (packages / discounts)
        defaultPackageIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Package",
        }],

        // Default discount % for discounts templates (sender can change at send time)
        defaultDiscountPercent: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        // Empty = visible to all roles that can send; otherwise only listed roles
        allowedRoles: [{
            type: String,
            enum: SENDABLE_ROLES,
        }],

        isDefault: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

whatsAppTemplateSchema.plugin(tenantPlugin);
whatsAppTemplateSchema.index({ tenantId: 1, name: 1, type: 1 });
whatsAppTemplateSchema.index({ tenantId: 1, type: 1, isDefault: 1 });
whatsAppTemplateSchema.index({ tenantId: 1, isActive: 1, isDefault: -1, createdAt: -1 });

try {
    module.exports = mongoose.model("WhatsAppTemplate");
} catch (_) {
    module.exports = mongoose.model("WhatsAppTemplate", whatsAppTemplateSchema);
}
module.exports.SENDABLE_ROLES = SENDABLE_ROLES;
