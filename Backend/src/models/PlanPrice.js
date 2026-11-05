const mongoose = require("mongoose");

/**
 * PlanPrice (Platform-Level)
 * Represents cycle-specific pricing (monthly, yearly, lifetime) for a plan tier.
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
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "USD",
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

planPriceSchema.index({ planId: 1, cycle: 1, isActive: 1 });

module.exports = mongoose.model("PlanPrice", planPriceSchema);
