const mongoose = require("mongoose");
const { CATEGORIES } = require("../config/featureRegistry");

const featureSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        category: {
            type: String,
            enum: CATEGORIES,
            default: "core",
            index: true,
        },
        isCore: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        // Set once the catalog sync has handled this key for existing plans, so a
        // plan the operator later edits is never re-seeded.
        plansBackfilledAt: {
            type: Date,
            default: null,
        },
        // Which gyms on a plan that includes this feature actually get it.
        rollout: {
            mode: { type: String, enum: ["all", "pilot", "percentage", "off"], default: "all" },
            percentage: { type: Number, min: 0, max: 100, default: 0 },
            pilotTenantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tenant" }],
        },
    },
    { timestamps: true }
);

try {
    module.exports = mongoose.model("Feature");
} catch (_) {
    module.exports = mongoose.model("Feature", featureSchema);
}
