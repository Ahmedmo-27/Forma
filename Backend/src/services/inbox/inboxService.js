const mongoose = require("mongoose");
const InboxConversation = require("../../models/InboxConversation");
const InboxMessage = require("../../models/InboxMessage");
const Member = require("../../models/Member");
const User = require("../../models/User");
const { runWithTenant } = require("../../context/tenantContext");
const { phoneCandidates } = require("../../utils/identityUniqueness");
const { NotFoundError, ValidationError } = require("../../utils/errors");
const logger = require("../../utils/logger");

const SNIPPET_LENGTH = 200;
const MAX_TEXT_LENGTH = 8000;
const MAX_ATTACHMENTS = 10;

function toDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric);
    return new Date();
}

function snippetOf(text, attachments) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean) return clean.slice(0, SNIPPET_LENGTH);
    const first = attachments?.[0];
    return first ? `[${first.type || "attachment"}]` : "";
}

function cleanAttachments(attachments) {
    if (!Array.isArray(attachments)) return [];
    return attachments.slice(0, MAX_ATTACHMENTS).map((item) => ({
        type: String(item?.type || "file").slice(0, 40),
        url: item?.url ? String(item.url).slice(0, 2000) : null,
        mimeType: item?.mimeType ? String(item.mimeType).slice(0, 120) : null,
        name: item?.name ? String(item.name).slice(0, 200) : null,
    }));
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function upsertConversation({ channel, contactId, contactName, timestamp }) {
    const filter = { channelId: channel._id, contactExternalId: contactId };
    const update = {
        $setOnInsert: {
            tenantId: channel.tenantId,
            channelType: channel.type,
            status: "open",
            lastMessageAt: timestamp,
            unreadCount: 0,
        },
    };
    if (contactName) update.$set = { contactName: String(contactName).slice(0, 160) };

    // Two webhooks for a brand-new contact can race on the unique index.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const result = await InboxConversation.findOneAndUpdate(filter, update, {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                includeResultMetadata: true,
            });
            return {
                conversation: result.value,
                created: Boolean(result.lastErrorObject?.upserted),
            };
        } catch (error) {
            if (error?.code === 11000 && attempt === 0) continue;
            throw error;
        }
    }
    return null;
}

async function linkMemberByPhone(conversation) {
    const contact = String(conversation.contactExternalId || "");
    // LID-only contacts have no phone to match.
    if (!contact || contact.includes("@")) {
        await InboxConversation.updateOne({ _id: conversation._id }, { $set: { memberLinkAttempted: true } });
        return null;
    }
    const candidates = phoneCandidates(contact);
    const member = candidates.length
        ? await Member.findOne({
            $or: [{ phoneKey: { $in: candidates } }, { phones: { $in: candidates } }],
        }).select("name").lean()
        : null;
    const set = { memberLinkAttempted: true };
    if (member) {
        set.memberId = member._id;
        if (!conversation.contactName && member.name) set.contactName = member.name;
    }
    await InboxConversation.updateOne({ _id: conversation._id }, { $set: set });
    return member;
}

async function ingestInTenant(input) {
    const {
        channel,
        contactExternalId,
        contactName,
        direction,
        text,
        attachments,
        externalMessageId,
        timestamp,
        sentBy,
    } = input;
    const contactId = String(contactExternalId || "").trim();
    if (!contactId) return null;

    const ts = toDate(timestamp);
    const cleanText = String(text || "").slice(0, MAX_TEXT_LENGTH);
    const files = cleanAttachments(attachments);
    if (!cleanText && !files.length) return null;

    const upserted = await upsertConversation({
        channel,
        contactId,
        contactName: direction === "inbound" ? contactName : "",
        timestamp: ts,
    });
    const conversation = upserted.conversation;

    let message;
    try {
        message = await InboxMessage.create({
            conversationId: conversation._id,
            channelId: channel._id,
            channelType: channel.type,
            direction,
            text: cleanText,
            attachments: files,
            externalMessageId: externalMessageId ? String(externalMessageId) : null,
            status: direction === "inbound" ? "received" : "sent",
            sentBy: sentBy || null,
            timestamp: ts,
        });
    } catch (error) {
        if (error?.code === 11000) {
            return { conversation, message: null, duplicate: true, created: false };
        }
        throw error;
    }

    const set = {};
    if (!conversation.lastMessageAt || ts >= conversation.lastMessageAt) {
        set.lastMessageText = snippetOf(cleanText, files);
        set.lastMessageDirection = direction;
    }
    const update = { $max: { lastMessageAt: ts } };
    if (direction === "inbound") {
        update.$inc = { unreadCount: 1 };
        update.$max.lastInboundAt = ts;
        // A new message from the contact reopens a finished or snoozed thread.
        if (conversation.status !== "open") {
            set.status = "open";
            set.snoozedUntil = null;
        }
    }
    if (Object.keys(set).length) update.$set = set;
    const refreshed = await InboxConversation.findOneAndUpdate(
        { _id: conversation._id },
        update,
        { new: true }
    ).lean();

    if (refreshed && channel.type === "whatsapp" && !refreshed.memberId && !refreshed.memberLinkAttempted) {
        try {
            await linkMemberByPhone(refreshed);
        } catch (error) {
            logger.warn("inbox", "Member auto-link failed", { error: error.message });
        }
    }

    return {
        conversation: refreshed || conversation,
        message,
        duplicate: false,
        created: upserted.created,
    };
}

/**
 * Store one message from any channel. Safe to call from webhooks and sockets:
 * it enters the tenant context itself and ignores retries of the same message.
 */
async function ingestMessage(input) {
    const tenantId = String(input.channel.tenantId);
    return runWithTenant({ tenantId }, () => ingestInTenant(input));
}

/**
 * Record a reply a staff member just sent. Runs inside the request's tenant
 * context. If the channel's echo arrived first, the existing row is reused.
 */
async function recordOutbound({ conversation, text, userId, externalMessageId }) {
    const ts = new Date();
    let message;
    try {
        message = await InboxMessage.create({
            conversationId: conversation._id,
            channelId: conversation.channelId,
            channelType: conversation.channelType,
            direction: "outbound",
            text: String(text || "").slice(0, MAX_TEXT_LENGTH),
            externalMessageId: externalMessageId ? String(externalMessageId) : null,
            status: "sent",
            sentBy: userId,
            timestamp: ts,
        });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        message = await InboxMessage.findOneAndUpdate(
            { channelId: conversation.channelId, externalMessageId: String(externalMessageId) },
            { $set: { sentBy: userId } },
            { new: true }
        );
    }
    await InboxConversation.updateOne(
        { _id: conversation._id },
        {
            $set: {
                lastMessageText: snippetOf(text, []),
                lastMessageDirection: "outbound",
                lastMessageAt: ts,
                unreadCount: 0,
                status: "open",
                snoozedUntil: null,
            },
        }
    );
    return message;
}

async function listConversations({ filters = {}, userId, skip = 0, limit = 30 }) {
    // Snoozes expire lazily so no scheduler is needed.
    await InboxConversation.updateMany(
        { status: "snoozed", snoozedUntil: { $lte: new Date() } },
        { $set: { status: "open", snoozedUntil: null } }
    );

    const query = {};
    if (filters.channelType) query.channelType = filters.channelType;
    if (filters.channelId) query.channelId = filters.channelId;
    if (filters.status) query.status = filters.status;
    if (filters.assignedTo === "me") query.assignedTo = userId;
    else if (filters.assignedTo === "unassigned") query.assignedTo = null;
    else if (filters.assignedTo) query.assignedTo = filters.assignedTo;
    if (filters.unread) query.unreadCount = { $gt: 0 };
    if (filters.search) {
        query.contactName = { $regex: escapeRegex(filters.search), $options: "i" };
    }

    const [total, items] = await Promise.all([
        InboxConversation.countDocuments(query),
        InboxConversation.find(query)
            .sort({ lastMessageAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("assignedTo", "name")
            .populate("memberId", "name")
            .lean(),
    ]);
    return { total, items };
}

async function getConversationOrThrow(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new NotFoundError("Conversation not found");
    const conversation = await InboxConversation.findById(id);
    if (!conversation) throw new NotFoundError("Conversation not found");
    return conversation;
}

async function getMessages({ conversationId, before, limit = 50 }) {
    await getConversationOrThrow(conversationId);
    const query = { conversationId };
    if (before) {
        const date = new Date(before);
        if (!Number.isNaN(date.getTime())) query.timestamp = { $lt: date };
    }
    const rows = await InboxMessage.find(query)
        .sort({ timestamp: -1 })
        .limit(limit + 1)
        .populate("sentBy", "name")
        .lean();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { messages: page.reverse(), hasMore };
}

async function updateConversation({ id, patch }) {
    const conversation = await getConversationOrThrow(id);
    const set = {};

    if (patch.assignedTo !== undefined) {
        if (patch.assignedTo === null) {
            set.assignedTo = null;
        } else {
            const user = await User.findById(patch.assignedTo).select("_id").lean();
            if (!user) throw new ValidationError("That staff member does not exist in this gym.");
            set.assignedTo = user._id;
        }
    }
    if (patch.status) {
        set.status = patch.status;
        set.snoozedUntil = patch.status === "snoozed" ? patch.snoozedUntil || null : null;
        if (patch.status === "snoozed" && !set.snoozedUntil) {
            throw new ValidationError("Choose when the snooze should end.");
        }
    }
    if (patch.memberId !== undefined) {
        if (patch.memberId === null) {
            set.memberId = null;
        } else {
            const member = await Member.findById(patch.memberId).select("_id name").lean();
            if (!member) throw new ValidationError("That member does not exist in this gym.");
            set.memberId = member._id;
            set.memberLinkAttempted = true;
            if (!conversation.contactName && member.name) set.contactName = member.name;
        }
    }
    if (patch.markRead) set.unreadCount = 0;

    if (!Object.keys(set).length) return conversation.toObject();
    return InboxConversation.findOneAndUpdate({ _id: conversation._id }, { $set: set }, { new: true })
        .populate("assignedTo", "name")
        .populate("memberId", "name")
        .lean();
}

module.exports = {
    toDate,
    snippetOf,
    ingestMessage,
    recordOutbound,
    listConversations,
    getConversationOrThrow,
    getMessages,
    updateConversation,
};
