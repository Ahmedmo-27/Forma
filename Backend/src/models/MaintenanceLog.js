const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const maintenanceLogSchema = new mongoose.Schema(
    {
        itemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MaintenanceItem",
            required: true,
        },
        locationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            required: true,
        },
        completedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        completedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1000,
        },
    },
    { timestamps: true }
);

maintenanceLogSchema.plugin(tenantPlugin);

maintenanceLogSchema.index({ tenantId: 1, itemId: 1, completedAt: -1 });
maintenanceLogSchema.index({ tenantId: 1, locationId: 1, completedAt: -1 });

module.exports =
    mongoose.models.MaintenanceLog ||
    mongoose.model("MaintenanceLog", maintenanceLogSchema);
