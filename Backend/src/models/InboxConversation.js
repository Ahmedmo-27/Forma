const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const CONVERSATION_STATUSES = ["open", "done", "snoozed"];

/**
 * One thread between a gym and one contact on one channel.
 * `contactExternalId` is the phone digits (or raw JID) of the WhatsApp contact.
 */
const inboxConversationSchema = new mongoose.Schema(
    {
        channelId: { type: mongoose.Schema.Types.ObjectId, ref: "InboxChannel", required: true },
        channelType: { type: String, enum: ["whatsapp"], required: true },
        contactExternalId: { type: String, required: true, trim: true },
        contactName: { type: String, default: "", trim: true },
        memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
        memberLinkAttempted: { type: Boolean, default: false },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        status: { type: String, enum: CONVERSATION_STATUSES, default: "open" },
        snoozedUntil: { type: Date, default: null },
        lastMessageAt: { type: Date, default: Date.now },
        lastMessageText: { type: String, default: "" },
        lastMessageDirection: { type: String, enum: ["inbound", "outbound", null], default: null },
        // When the contact last wrote to us.
        lastInboundAt: { type: Date, default: null },
        unreadCount: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

inboxConversationSchema.plugin(tenantPlugin);
inboxConversationSchema.index(
    { tenantId: 1, channelId: 1, contactExternalId: 1 },
    { unique: true }
);
inboxConversationSchema.index({ tenantId: 1, status: 1, lastMessageAt: -1 });
inboxConversationSchema.index({ tenantId: 1, assignedTo: 1, lastMessageAt: -1 });
inboxConversationSchema.index({ tenantId: 1, memberId: 1 });

try {
    module.exports = mongoose.model("InboxConversation");
} catch (_) {
    module.exports = mongoose.model("InboxConversation", inboxConversationSchema);
}

module.exports.INBOX_CONVERSATION_STATUSES = CONVERSATION_STATUSES;
