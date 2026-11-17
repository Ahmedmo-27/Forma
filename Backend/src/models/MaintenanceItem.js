const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const INTERVAL_UNITS = ["hour", "day", "week", "month"];

const maintenanceItemSchema = new mongoose.Schema(
    {
        locationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1000,
        },
        intervalValue: {
            type: Number,
            required: true,
            min: 1,
        },
        intervalUnit: {
            type: String,
            enum: INTERVAL_UNITS,
            required: true,
        },
        active: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

maintenanceItemSchema.plugin(tenantPlugin);

maintenanceItemSchema.index({ tenantId: 1, locationId: 1, active: 1 });
maintenanceItemSchema.index({ tenantId: 1, locationId: 1, title: 1 });

module.exports =
    mongoose.models.MaintenanceItem ||
    mongoose.model("MaintenanceItem", maintenanceItemSchema);
module.exports.INTERVAL_UNITS = INTERVAL_UNITS;
