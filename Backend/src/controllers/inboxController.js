const mongoose = require("mongoose");
const { AppError, ValidationError } = require("../utils/errors");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { writeAudit } = require("../utils/audit");
const { invalidateTenantCache } = require("../utils/cacheInvalidator");
const { assertMonthlyAllowance, incrementCachedAllowance } = require("../utils/whatsappTracking");
const inboxService = require("../services/inbox/inboxService");
const channelService = require("../services/inbox/channelService");
const channelDispatcher = require("../services/inbox/channelDispatcher");

const CHANNEL_TYPES = ["whatsapp"];
const STATUSES = ["open", "done", "snoozed"];
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

function tenantIdOf(req) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new AppError("VALIDATION_FAILED", "No tenant context associated with this user");
    return tenantId;
}

/** Read list filters from the query string. Unknown values are rejected, not ignored. */
function readFilters(query) {
    const filters = {};
    if (query.channelType !== undefined) {
        if (!CHANNEL_TYPES.includes(query.channelType)) throw new ValidationError("Unknown channel type.");
        filters.channelType = query.channelType;
    }
    if (query.channelId !== undefined) {
        if (!isId(query.channelId)) throw new ValidationError("Invalid channel id.");
        filters.channelId = query.channelId;
    }
    if (query.status !== undefined) {
        if (!STATUSES.includes(query.status)) throw new ValidationError("Unknown status.");
        filters.status = query.status;
    }
    if (query.assignedTo !== undefined) {
        if (!["me", "unassigned"].includes(query.assignedTo) && !isId(query.assignedTo)) {
            throw new ValidationError("Invalid assignee.");
        }
        filters.assignedTo = query.assignedTo;
    }
    if (query.unread === "true") filters.unread = true;
    if (typeof query.search === "string" && query.search.trim()) {
        filters.search = query.search.trim().slice(0, 80);
    }
    return filters;
}

const listConversations = async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 100 });
        const { total, items } = await inboxService.listConversations({
            filters: readFilters(req.query),
            userId: req.user.id,
            skip,
            limit,
        });
        res.status(200).json({ conversations: items, pagination: buildPagination(page, limit, total) });
    } catch (error) {
        next(error);
    }
};

const getMessages = async (req, res, next) => {
    try {
        const requested = parseInt(req.query.limit, 10);
        const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 50));
        const result = await inboxService.getMessages({
            conversationId: req.params.id,
            before: typeof req.query.before === "string" ? req.query.before : undefined,
            limit,
        });
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const sendReply = async (req, res, next) => {
    try {
        const tenantId = tenantIdOf(req);
        const conversation = await inboxService.getConversationOrThrow(req.params.id);
        const isWhatsApp = conversation.channelType === "whatsapp";
        // WhatsApp replies count toward the gym's monthly message allowance.
        if (isWhatsApp) await assertMonthlyAllowance(req);

        const { text } = req.body;
        const result = await channelDispatcher.sendReply({ conversation, text, tenantId });
        const message = await inboxService.recordOutbound({
            conversation,
            text,
            userId: req.user.id,
            externalMessageId: result.externalMessageId,
        });

        if (isWhatsApp) {
            incrementCachedAllowance(tenantId);
            invalidateTenantCache(tenantId, "tenant");
            await writeAudit({
                action: "whatsapp_message_sent",
                actor: req.user.id,
                actorRole: req.user.role,
                targetType: "other",
                targetId: String(conversation._id),
                meta: { source: "inbox", channelType: conversation.channelType },
                req,
            });
        }

        res.status(201).json({ message });
    } catch (error) {
        next(error);
    }
};

const patchConversation = async (req, res, next) => {
    try {
        const conversation = await inboxService.updateConversation({ id: req.params.id, patch: req.body });
        res.status(200).json({ conversation });
    } catch (error) {
        next(error);
    }
};

const listChannels = async (req, res, next) => {
    try {
        const channels = await channelService.listChannels();
        res.status(200).json({ channels });
    } catch (error) {
        next(error);
    }
};

const disconnectChannel = async (req, res, next) => {
    try {
        if (!isId(req.params.id)) throw new ValidationError("Invalid channel id.");
        const channel = await channelService.disconnectChannel({
            channelId: req.params.id,
            tenantId: tenantIdOf(req),
        });
        res.status(200).json({ channel });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listConversations,
    getMessages,
    sendReply,
    patchConversation,
    listChannels,
    disconnectChannel,
};
