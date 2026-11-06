const mongoose = require("mongoose");
const { enforceEgpCurrency } = require("./forceEgp");

const invoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        billingEventId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BillingEvent",
            default: null,
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
            enum: ["paid", "refunded", "void"],
            default: "paid",
            index: true,
        },
        planKey: {
            type: String,
            required: true,
        },
        cycle: {
            type: String,
            required: true,
        },
        paymentRef: {
            type: String,
            default: null,
        },
        paymentMethod: {
            type: String,
            default: "manual_transfer",
        },
        sellerDetails: {
            name: { type: String, default: "Leap SaaS Inc." },
            taxId: { type: String, default: "EG-TAX-10293847" },
            address: { type: String, default: "Cairo, Egypt" },
            supportEmail: { type: String, default: "billing@leapgym.com" },
        },
        buyerDetails: {
            tenantName: { type: String, required: true },
            tenantSlug: { type: String, required: true },
            ownerName: { type: String, default: "" },
            ownerEmail: { type: String, default: "" },
        },
        issuedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

enforceEgpCurrency(invoiceSchema);

try {
    module.exports = mongoose.model("Invoice");
} catch (_) {
    module.exports = mongoose.model("Invoice", invoiceSchema);
}
