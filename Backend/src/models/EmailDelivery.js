const mongoose = require("mongoose");

/**
 * Dedupes scheduled owner mail. No tenantPlugin: the hourly job runs as platform
 * and must see every gym. `window` is the reminder offset, such as "3".
 */
const emailDeliverySchema = new mongoose.Schema(
    {
        kind: { type: String, required: true },
        tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
        window: { type: String, required: true },
        to: { type: String, default: "" },
        status: { type: String, enum: ["pending", "sent"], default: "pending" },
        sentAt: { type: Date, default: null },
    },
    { timestamps: true }
);

emailDeliverySchema.index({ kind: 1, tenantId: 1, window: 1 }, { unique: true });

module.exports = mongoose.models.EmailDelivery
    || mongoose.model("EmailDelivery", emailDeliverySchema);
