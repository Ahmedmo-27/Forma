const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");
const { enforceEgpCurrency } = require("./forceEgp");

/**
 * Platform billing invoices. Always carry explicit tenantId.
 * Create/list from runAsPlatform (or runWithTenant for tenant self-serve).
 */
const invoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
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
            name: { type: String, default: "Forma" },
            taxId: { type: String, default: "EG-TAX-10293847" },
            address: { type: String, default: "Cairo, Egypt" },
            supportEmail: { type: String, default: "billing@forma.app" },
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

invoiceSchema.plugin(tenantPlugin);
enforceEgpCurrency(invoiceSchema);

module.exports = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
