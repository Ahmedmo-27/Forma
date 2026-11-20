const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

/**
 * Money the gym owes (or has paid) an external vendor for a period.
 * `amount` is the vendor share of sales in [periodFrom, periodTo] (Cairo days,
 * stored as YYYY-MM-DD keys) net of refunds, minus nothing else; overlapping
 * periods are rejected by the controller so a sale is never paid twice.
 */
const vendorPayoutSchema = new mongoose.Schema(
    {
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
        periodFrom: { type: String, required: true },
        periodTo: { type: String, required: true },
        grossSales: { type: Number, default: 0 },
        gymShare: { type: Number, default: 0 },
        amount: { type: Number, required: true, min: 0 },
        status: { type: String, enum: ["pending", "settled"], default: "pending" },
        settledAt: { type: Date, default: null },
        settledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        note: { type: String, default: "", trim: true, maxlength: 300 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

vendorPayoutSchema.plugin(tenantPlugin);

vendorPayoutSchema.index({ tenantId: 1, vendorId: 1, periodFrom: 1, periodTo: 1 });
vendorPayoutSchema.index({ tenantId: 1, locationId: 1, status: 1 });

module.exports =
    mongoose.models.VendorPayout ||
    mongoose.model("VendorPayout", vendorPayoutSchema);
