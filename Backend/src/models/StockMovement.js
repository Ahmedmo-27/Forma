const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const MOVEMENT_TYPES = ["restock", "sale", "adjustment", "refund"];

/** Append-only stock history; `qty` is a signed delta. */
const stockMovementSchema = new mongoose.Schema(
    {
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        type: { type: String, enum: MOVEMENT_TYPES, required: true },
        qty: { type: Number, required: true },
        balanceAfter: { type: Number, default: null },
        reason: { type: String, default: "", trim: true, maxlength: 300 },
        saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

stockMovementSchema.plugin(tenantPlugin);

stockMovementSchema.index({ tenantId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 });

module.exports =
    mongoose.models.StockMovement ||
    mongoose.model("StockMovement", stockMovementSchema);
module.exports.MOVEMENT_TYPES = MOVEMENT_TYPES;
