const mongoose = require("mongoose");

/**
 * BillingEvent (Platform-Level, Append-Only Ledger)
 * Immutable ledger tracking every financial and lifecycle entitlement transition:
 * - purchase, upgrade, refund, revoke, price_change, manual_grant.
 *
 * Enforces append-only: updates and deletions are strictly prevented at schema level.
 */
const billingEventSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: [
                "purchase",
                "upgrade",
                "refund",
                "revoke",
                "price_change",
                "manual_grant",
            ],
            index: true,
        },
        planKey: {
            type: String,
            required: true,
            enum: ["basic", "gold", "platinum"],
        },
        cycle: {
            type: String,
            required: true,
            enum: ["monthly", "yearly", "lifetime"],
        },
        amount: {
            type: Number,
            required: true,
            default: 0,
        },
        currency: {
            type: String,
            required: true,
            default: "USD",
            uppercase: true,
            trim: true,
        },
        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        actorType: {
            type: String,
            enum: ["User", "PlatformAdmin", "system"],
            default: "User",
        },
        externalRef: {
            type: String,
            default: null,
            index: true,
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // Immutable: no updatedAt
    }
);

billingEventSchema.index({ tenantId: 1, createdAt: -1 });

// Guard against modifications and deletions on the immutable ledger
const rejectMutation = function (next) {
    const err = new Error("BillingEventMutationError: Billing events are immutable append-only records.");
    if (typeof next === "function") return next(err);
    throw err;
};

billingEventSchema.pre("updateOne", rejectMutation);
billingEventSchema.pre("updateMany", rejectMutation);
billingEventSchema.pre("findOneAndUpdate", rejectMutation);
billingEventSchema.pre("findOneAndReplace", rejectMutation);
billingEventSchema.pre("deleteOne", rejectMutation);
billingEventSchema.pre("deleteMany", rejectMutation);
billingEventSchema.pre("findOneAndDelete", rejectMutation);

try {
    module.exports = mongoose.model("BillingEvent");
} catch (_) {
    module.exports = mongoose.model("BillingEvent", billingEventSchema);
}
