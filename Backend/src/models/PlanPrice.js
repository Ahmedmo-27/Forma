const mongoose = require("mongoose");
const { enforceEgpCurrency } = require("./forceEgp");

/**
 * PlanPrice (Platform-Level)
 * Represents cycle-specific pricing for a plan tier.
 * `cycle` is the unit (monthly / yearly / lifetime); `intervalCount` is how many
 * units are sold (e.g. monthly×3 = 3 months, yearly×2 = 2 years).
 * Supports promotional validity windows and atomic seat caps for lifetime deals.
 */
const planPriceSchema = new mongoose.Schema(
    {
        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Plan",
            required: true,
            index: true,
        },
        cycle: {
            type: String,
            required: true,
            enum: ["monthly", "yearly", "lifetime"],
            index: true,
        },
        intervalCount: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },
        amount: {
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
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        validFrom: {
            type: Date,
            default: Date.now,
        },
        validUntil: {
            type: Date,
            default: null, // Nullable: open-ended unless limited-time launch deal
        },
        maxLifetimeSeats: {
            type: Number,
            default: null, // Nullable: unconstrained unless capped promotional batch
        },
        soldLifetimeSeats: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

planPriceSchema.index({ planId: 1, cycle: 1, intervalCount: 1, isActive: 1 });
planPriceSchema.index(
    { planId: 1, cycle: 1, intervalCount: 1 },
    { unique: true, partialFilterExpression: { isActive: true } }
);
enforceEgpCurrency(planPriceSchema);

try {
    module.exports = mongoose.model("PlanPrice");
} catch (_) {
    module.exports = mongoose.model("PlanPrice", planPriceSchema);
}
