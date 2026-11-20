const InboxChannel = require("../../models/InboxChannel");
const { runWithTenant } = require("../../context/tenantContext");
const { NotFoundError } = require("../../utils/errors");
const logger = require("../../utils/logger");

const inTenant = (tenantId, fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

/**
 * Called when a Baileys session reaches "connected". Makes the linked number a
 * channel in the gym's inbox, so it shows up before the first message arrives.
 */
async function ensureWhatsAppChannel({ tenantId, userId, phone }) {
    const externalId = String(phone || "").trim();
    if (!externalId) return null;
    return inTenant(tenantId, async () => {
        const channel = await InboxChannel.findOneAndUpdate(
            { type: "whatsapp", externalId },
            {
                $set: {
                    userId,
                    connectedBy: userId,
                    status: "connected",
                    displayName: `+${externalId}`,
                    lastError: null,
                },
                $setOnInsert: { tenantId },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        // A user who relinked a different number no longer owns the old one.
        await InboxChannel.updateMany(
            { type: "whatsapp", userId, externalId: { $ne: externalId }, status: "connected" },
            { $set: { status: "disconnected" } }
        );
        return channel;
    });
}

async function markWhatsAppDisconnected({ tenantId, userId }) {
    return inTenant(tenantId, async () => {
        await InboxChannel.updateMany(
            { type: "whatsapp", userId, status: "connected" },
            { $set: { status: "disconnected" } }
        );
    });
}

/** Hook for the WhatsApp session manager. Never throws into the socket. */
async function syncWhatsAppSession({ tenantId, userId, status, phone }) {
    try {
        if (status === "connected" && phone) {
            await ensureWhatsAppChannel({ tenantId, userId, phone });
        } else if (status === "disconnected") {
            await markWhatsAppDisconnected({ tenantId, userId });
        }
    } catch (error) {
        logger.error("inbox", "Could not sync WhatsApp inbox channel", {
            error: error.message,
            userId: String(userId),
        });
    }
}

/** Public shape. */
function publicChannel(channel, liveStatus) {
    return {
        id: String(channel._id),
        type: channel.type,
        externalId: channel.externalId,
        displayName: channel.displayName || channel.externalId,
        status: liveStatus || channel.status,
        lastError: channel.lastError || null,
        connectedBy: channel.connectedBy ? String(channel.connectedBy) : null,
        createdAt: channel.createdAt,
    };
}

async function listChannels() {
    const channels = await InboxChannel.find().sort({ createdAt: 1 }).lean();
    const { getSessionStatus } = require("../whatsapp/sessionManager");
    const result = [];
    for (const channel of channels) {
        let live = null;
        if (channel.type === "whatsapp" && channel.userId && channel.status === "connected") {
            try {
                const session = await getSessionStatus({
                    tenantId: String(channel.tenantId),
                    userId: String(channel.userId),
                });
                // "qr"/"connecting" mean the number is not usable right now.
                live = session.status === "connected" ? "connected" : "disconnected";
            } catch {
                live = null;
            }
        }
        result.push(publicChannel(channel, live));
    }
    return result;
}

/**
 * Disconnect a channel. Conversations stay for history.
 * WhatsApp: unlink the session.
 */
async function disconnectChannel({ channelId, tenantId }) {
    const channel = await InboxChannel.findById(channelId);
    if (!channel) throw new NotFoundError("Channel not found");

    if (channel.type === "whatsapp" && channel.userId) {
        const { logoutSession } = require("../whatsapp/sessionManager");
        await logoutSession({ tenantId: String(tenantId), userId: String(channel.userId) });
    }

    channel.status = "disconnected";
    await channel.save();
    return publicChannel(channel.toObject());
}

module.exports = {
    ensureWhatsAppChannel,
    markWhatsAppDisconnected,
    syncWhatsAppSession,
    publicChannel,
    listChannels,
    disconnectChannel,
};
