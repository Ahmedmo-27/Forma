const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ["info", "warning", "maintenance", "feature"],
            default: "info",
        },
        target: {
            type: {
                type: String,
                enum: ["all", "plan", "tenant"],
                default: "all",
            },
            targetPlanKeys: [{ type: String }],
            targetTenantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tenant" }],
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null,
        },
    },
    { timestamps: true }
);

announcementSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

try {
    module.exports = mongoose.model("Announcement");
} catch (_) {
    module.exports = mongoose.model("Announcement", announcementSchema);
}
