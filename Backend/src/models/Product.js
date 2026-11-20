const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const productSchema = new mongoose.Schema(
    {
        locationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            required: true,
        },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductCategory",
            required: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
        },
        price: { type: Number, required: true, min: 0 },
        sku: { type: String, default: "", trim: true, maxlength: 64 },
        // Bar items (shakes, coffee) are usually made to order and skip stock counts.
        trackStock: { type: Boolean, default: false },
        stockQty: { type: Number, default: 0 },
        lowStockThreshold: { type: Number, default: 0, min: 0 },
        imageUrl: { type: String, default: "", trim: true, maxlength: 500 },
        active: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

productSchema.plugin(tenantPlugin);

productSchema.index({ tenantId: 1, locationId: 1, active: 1, categoryId: 1 });
productSchema.index({ tenantId: 1, locationId: 1, vendorId: 1 });
productSchema.index({ tenantId: 1, locationId: 1, name: 1 });
productSchema.index(
    { tenantId: 1, locationId: 1, sku: 1 },
    { unique: true, partialFilterExpression: { sku: { $gt: "" } } }
);

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
