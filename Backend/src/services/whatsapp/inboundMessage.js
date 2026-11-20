const { phoneFromJid } = require("./phone");

// Groups, status updates, channels and broadcast lists are not customer conversations.
const IGNORED_JID = /@(g\.us|broadcast|newsletter)$/;
const SKIPPED_CONTENT = [
    "protocolMessage",
    "reactionMessage",
    "senderKeyDistributionMessage",
    "pollUpdateMessage",
];
const WRAPPERS = [
    (m) => m.ephemeralMessage?.message,
    (m) => m.viewOnceMessage?.message,
    (m) => m.viewOnceMessageV2?.message,
    (m) => m.viewOnceMessageV2Extension?.message,
    (m) => m.documentWithCaptionMessage?.message,
];

function unwrap(message) {
    let current = message;
    for (let depth = 0; depth < 4; depth += 1) {
        let next = null;
        for (const wrapper of WRAPPERS) {
            next = wrapper(current);
            if (next) break;
        }
        if (!next) return current;
        current = next;
    }
    return current;
}

function textOf(m) {
    return (
        m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || m.buttonsResponseMessage?.selectedDisplayText
        || m.listResponseMessage?.title
        || m.templateButtonReplyMessage?.selectedDisplayText
        || ""
    );
}

function attachmentsOf(m) {
    const files = [];
    if (m.imageMessage) files.push({ type: "image", mimeType: m.imageMessage.mimetype || null });
    if (m.videoMessage) files.push({ type: "video", mimeType: m.videoMessage.mimetype || null });
    if (m.audioMessage) files.push({ type: m.audioMessage.ptt ? "voice" : "audio", mimeType: m.audioMessage.mimetype || null });
    if (m.documentMessage) {
        files.push({
            type: "document",
            mimeType: m.documentMessage.mimetype || null,
            name: m.documentMessage.fileName || null,
        });
    }
    if (m.stickerMessage) files.push({ type: "sticker", mimeType: m.stickerMessage.mimetype || null });
    if (m.locationMessage) files.push({ type: "location" });
    if (m.contactMessage || m.contactsArrayMessage) files.push({ type: "contact" });
    return files;
}

/** Baileys timestamps are seconds, sometimes as a Long. Returns milliseconds. */
function timestampMs(raw) {
    const seconds = typeof raw?.toNumber === "function" ? raw.toNumber() : Number(raw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
}

/**
 * Reduce a Baileys message to what the inbox stores, or null when it is not a
 * customer conversation message (group, status, reaction, protocol, empty).
 *
 * Baileys 7 can address a contact by LID. When the phone number is exposed
 * (`remoteJidAlt`) we use it, otherwise the raw JID is kept so replies still work.
 */
function extractInboundMessage(msg) {
    const key = msg?.key;
    const jid = key?.remoteJid;
    if (!msg?.message || !jid || IGNORED_JID.test(jid)) return null;

    const content = unwrap(msg.message);
    if (!content || SKIPPED_CONTENT.some((name) => content[name])) return null;

    const text = String(textOf(content) || "");
    const attachments = attachmentsOf(content);
    if (!text && !attachments.length) return null;

    const alt = key.remoteJidAlt || key.senderPn || null;
    const contactPhone = phoneFromJid(jid) || phoneFromJid(alt);
    const contactExternalId = contactPhone || jid;
    const fromMe = Boolean(key.fromMe);

    return {
        contactJid: jid,
        contactPhone,
        contactExternalId,
        fromMe,
        text,
        attachments,
        messageId: key.id || null,
        timestamp: timestampMs(msg.messageTimestamp),
        pushName: fromMe ? null : msg.pushName || null,
    };
}

module.exports = { extractInboundMessage, timestampMs };
