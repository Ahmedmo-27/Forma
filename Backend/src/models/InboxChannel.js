const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const CHANNEL_TYPES = ["whatsapp"];
const CHANNEL_STATUSES = ["connected", "disconnected"];

/**
 * One connected messaging account in a gym's shared inbox.
 *
 * - whatsapp: `externalId` is the linked phone. `userId` is the staff member
 *   whose Baileys session carries the traffic (see WhatsAppSession).
 */
const inboxChannelSchema = new mongoose.Schema(
    {
        type: { type: String, enum: CHANNEL_TYPES, required: true },
        externalId: { type: String, required: true, trim: true },
        displayName: { type: String, default: "", trim: true },
        status: { type: String, enum: CHANNEL_STATUSES, default: "connected" },
        connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        lastError: { type: String, default: null },
    },
    { timestamps: true }
);

inboxChannelSchema.plugin(tenantPlugin);
inboxChannelSchema.index({ tenantId: 1, type: 1, externalId: 1 }, { unique: true });
inboxChannelSchema.index({ type: 1, externalId: 1 });

try {
    module.exports = mongoose.model("InboxChannel");
} catch (_) {
    module.exports = mongoose.model("InboxChannel", inboxChannelSchema);
}

module.exports.INBOX_CHANNEL_TYPES = CHANNEL_TYPES;
module.exports.INBOX_CHANNEL_STATUSES = CHANNEL_STATUSES;
