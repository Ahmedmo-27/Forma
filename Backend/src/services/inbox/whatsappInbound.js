const { ensureWhatsAppChannel } = require("./channelService");
const { ingestMessage } = require("./inboxService");

/**
 * Entry point for the Baileys session manager. `phone` is the number linked to
 * the socket that received the message, which identifies the inbox channel.
 */
async function handleWhatsAppInbound({ tenantId, userId, phone, message }) {
    if (!phone || !message) return null;
    const channel = await ensureWhatsAppChannel({ tenantId, userId, phone });
    if (!channel) return null;

    return ingestMessage({
        channel,
        contactExternalId: message.contactExternalId,
        contactName: message.pushName,
        direction: message.fromMe ? "outbound" : "inbound",
        text: message.text,
        attachments: message.attachments,
        externalMessageId: message.messageId,
        timestamp: message.timestamp,
    });
}

module.exports = { handleWhatsAppInbound };
