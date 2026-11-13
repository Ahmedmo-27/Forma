const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");
const { enforceEgpCurrency } = require("./forceEgp");

/**
 * Manual bank-transfer payment proofs. Created under runAsPlatform during
 * public signup / platform review; tenantId always set explicitly.
 */
const manualPaymentSchema = new mongoose.Schema(
    {
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
        intervalCount: {
            type: Number,
            min: 1,
            default: 1,
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

manualPaymentSchema.plugin(tenantPlugin);
manualPaymentSchema.index({ status: 1, createdAt: -1 });
enforceEgpCurrency(manualPaymentSchema);

module.exports = mongoose.models.ManualPayment || mongoose.model("ManualPayment", manualPaymentSchema);
