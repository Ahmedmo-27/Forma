const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const MESSAGE_STATUSES = ["received", "sent", "delivered", "read", "failed"];

const attachmentSchema = new mongoose.Schema(
    {
        type: { type: String, default: "file" },
        url: { type: String, default: null },
        mimeType: { type: String, default: null },
        name: { type: String, default: null },
    },
    { _id: false }
);

const inboxMessageSchema = new mongoose.Schema(
    {
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "InboxConversation", required: true },
        channelId: { type: mongoose.Schema.Types.ObjectId, ref: "InboxChannel", required: true },
        channelType: { type: String, enum: ["whatsapp"], required: true },
        direction: { type: String, enum: ["inbound", "outbound"], required: true },
        text: { type: String, default: "" },
        attachments: { type: [attachmentSchema], default: [] },
        externalMessageId: { type: String, default: null },
        status: { type: String, enum: MESSAGE_STATUSES, default: "received" },
        sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        timestamp: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

inboxMessageSchema.plugin(tenantPlugin);
inboxMessageSchema.index({ tenantId: 1, conversationId: 1, timestamp: -1 });
// Webhook retries and echoes of our own sends must not create a second row.
inboxMessageSchema.index(
    { channelId: 1, externalMessageId: 1 },
    {
        unique: true,
        partialFilterExpression: { externalMessageId: { $type: "string" } },
        name: "channel_external_message_unique",
    }
);

try {
    module.exports = mongoose.model("InboxMessage");
} catch (_) {
    module.exports = mongoose.model("InboxMessage", inboxMessageSchema);
}

module.exports.INBOX_MESSAGE_STATUSES = MESSAGE_STATUSES;
