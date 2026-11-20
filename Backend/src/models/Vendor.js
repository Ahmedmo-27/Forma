const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const VENDOR_TYPES = ["in_house", "external"];

/**
 * A seller that rings up sales at a branch: the gym's own bar or an external
 * concession (supplement brand, juice bar operator, ...).
 * `commissionPercent` is the gym's share of each sale; the vendor keeps the rest.
 */
const vendorSchema = new mongoose.Schema(
    {
        locationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            required: true,
        },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        type: { type: String, enum: VENDOR_TYPES, default: "external" },
        contactName: { type: String, default: "", trim: true, maxlength: 120 },
        phone: { type: String, default: "", trim: true, maxlength: 40 },
        email: { type: String, default: "", trim: true, maxlength: 160 },
        notes: { type: String, default: "", trim: true, maxlength: 500 },
        commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
        active: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

vendorSchema.plugin(tenantPlugin);

vendorSchema.index({ tenantId: 1, locationId: 1, active: 1 });
vendorSchema.index({ tenantId: 1, locationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Vendor || mongoose.model("Vendor", vendorSchema);
module.exports.VENDOR_TYPES = VENDOR_TYPES;
