const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const locationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        // Tenant-unique business code, e.g. LOC-001
        locationId: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        // Google Maps link
        branch_location: {
            type: String,
            default: "",
            trim: true,
        },
    },
    { timestamps: true }
);

locationSchema.plugin(tenantPlugin);

locationSchema.index({ tenantId: 1, locationId: 1 }, { unique: true });
locationSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.models.Location || mongoose.model("Location", locationSchema);
