const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const PAYMENT_METHODS = ["cash", "card", "wallet"];
const SALE_STATUSES = ["completed", "partially_refunded", "refunded"];

/**
 * Line item with snapshots: later price, name or commission edits never
 * rewrite what was actually charged and split on the day of sale.
 */
const saleItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductCategory", default: null },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
        vendorName: { type: String, default: "" },
        unitPrice: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
        refundedQty: { type: Number, default: 0, min: 0 },
        trackedStock: { type: Boolean, default: false },
        commissionPercent: { type: Number, required: true, min: 0, max: 100 },
        // Net amounts for the line after the sale discount was spread across lines.
        lineTotal: { type: Number, required: true, min: 0 },
        gymShare: { type: Number, required: true, min: 0 },
        vendorShare: { type: Number, required: true, min: 0 },
        refundedAmount: { type: Number, default: 0, min: 0 },
        refundedGymShare: { type: Number, default: 0, min: 0 },
        refundedVendorShare: { type: Number, default: 0, min: 0 },
    },
    { _id: true }
);

const saleSchema = new mongoose.Schema(
    {
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
        receiptNumber: { type: Number, required: true },
        items: { type: [saleItemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },
        subtotal: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        total: { type: Number, required: true, min: 0 },
        gymShare: { type: Number, required: true, min: 0 },
        vendorShare: { type: Number, required: true, min: 0 },
        paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "cash" },
        memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
        memberName: { type: String, default: "" },
        note: { type: String, default: "", trim: true, maxlength: 300 },
        cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        status: { type: String, enum: SALE_STATUSES, default: "completed" },
        refundedTotal: { type: Number, default: 0, min: 0 },
        refundedGymShare: { type: Number, default: 0, min: 0 },
        refundedVendorShare: { type: Number, default: 0, min: 0 },
        // Optimistic lock so two concurrent refunds cannot return the same units twice.
        refundSeq: { type: Number, default: 0 },
        refunds: [
            {
                _id: false,
                at: { type: Date, default: Date.now },
                by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
                reason: { type: String, default: "" },
                amount: { type: Number, default: 0 },
                gymShare: { type: Number, default: 0 },
                vendorShare: { type: Number, default: 0 },
            },
        ],
    },
    { timestamps: true }
);

saleSchema.plugin(tenantPlugin);

saleSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
saleSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, "items.vendorId": 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });

module.exports = mongoose.models.Sale || mongoose.model("Sale", saleSchema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.SALE_STATUSES = SALE_STATUSES;
