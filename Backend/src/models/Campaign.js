const mongoose = require("mongoose");

const STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"];

const campaignSchema = new mongoose.Schema(
    {
        templateKey: {
            type: String,
            enum: ["product_update", "offer", "win_back"],
            required: true,
        },
        subject: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
        ctaLabel: { type: String, default: "" },
        ctaUrl: { type: String, default: "" },
        audience: {
            statuses: [{ type: String, enum: STATUSES }],
        },
        sentCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        skippedCount: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformUser", default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);
module.exports.AUDIENCE_STATUSES = STATUSES;
