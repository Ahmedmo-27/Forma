const InboxChannel = require("../../models/InboxChannel");
const { AppError } = require("../../utils/errors");

async function sendWhatsApp({ channel, conversation, text, tenantId }) {
    const { sendReply, WhatsAppSessionError } = require("../whatsapp/sessionManager");
    if (!channel.userId) throw new AppError("INBOX_CHANNEL_NOT_CONNECTED");
    try {
        const result = await sendReply({
            tenantId: String(tenantId),
            userId: String(channel.userId),
            to: conversation.contactExternalId,
            text,
        });
        return { externalMessageId: result.messageId || null };
    } catch (error) {
        if (error instanceof WhatsAppSessionError) {
            const status = error.code === "WHATSAPP_TIMEOUT" ? 504 : error.code === "WHATSAPP_NOT_CONNECTED" ? 409 : 400;
            throw new AppError(error.code, error.message, status);
        }
        throw error;
    }
}

/**
 * Send a staff reply on the conversation's own channel. Returns the channel's
 * message id so an echo can be matched to what we already stored.
 */
async function sendReply({ conversation, text, tenantId }) {
    const channel = await InboxChannel.findById(conversation.channelId);
    if (!channel || channel.status !== "connected") throw new AppError("INBOX_CHANNEL_NOT_CONNECTED");
    return sendWhatsApp({ channel, conversation, text, tenantId });
}

module.exports = {
    sendReply,
};
