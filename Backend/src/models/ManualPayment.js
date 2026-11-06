const mongoose = require("mongoose");
const { enforceEgpCurrency } = require("./forceEgp");

const manualPaymentSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        paymentRef: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        planKey: {
            type: String,
            required: true,
        },
        cycle: {
            type: String,
            required: true,
            enum: ["monthly", "yearly", "lifetime"],
        },
        amount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: "EGP",
            uppercase: true,
        },
        status: {
            type: String,
            enum: ["pending", "confirmed", "rejected"],
            default: "pending",
            index: true,
        },
        proofStorageKey: {
            type: String,
            default: null,
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        notes: {
            type: String,
            default: "",
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
        rejectReason: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

manualPaymentSchema.index({ status: 1, createdAt: -1 });
enforceEgpCurrency(manualPaymentSchema);

try {
    module.exports = mongoose.model("ManualPayment");
} catch (_) {
    module.exports = mongoose.model("ManualPayment", manualPaymentSchema);
}
