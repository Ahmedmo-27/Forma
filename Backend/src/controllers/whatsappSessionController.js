const AuditLog = require("../models/AuditLog");
const WhatsAppTemplate = require("../models/WhatsAppTemplate");
const { hasAccess, hasExplicitGrant } = require("../utils/accessControl");
const { writeAudit } = require("../utils/audit");
const { AppError, ForbiddenError } = require("../utils/errors");
const { detectMimeFromBuffer, IMAGE_ONLY } = require("../utils/fileMagic");
const { WhatsAppSessionError } = require("../services/whatsapp/sessionManager");
const { findMemberByIdentifier } = require("../utils/memberLookup");
const {
    getSessionStatus,
    startSession,
    logoutSession,
    sendText,
    sendImage,
} = require("../services/whatsapp/sessionManager");

function actor(req) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
        throw new AppError("VALIDATION_FAILED", "No tenant context associated with this user");
    }
    return { tenantId, userId };
}

function assertTemplateSendAllowed(user) {
    if ((user.role === "Sales" || hasExplicitGrant(user, "whatsapp_send")) && !hasAccess(user, "whatsapp_send")) {
        throw new ForbiddenError("AUTH_FORBIDDEN", "You are not allowed to send WhatsApp template messages");
    }
}

function monthlyLimit(tenant) {
    const isLifetime = tenant?.billing?.cycle === "lifetime";
    if (isLifetime) {
        return tenant?.billing?.lifetime?.fairUseLimits?.whatsappMessagesMonthlyLimit || 2000;
    }
    return 500;
}

function startOfMonth(timeZone) {
    const zone = timeZone || "Africa/Cairo";
    let parts;
    try {
        parts = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
        }).formatToParts(new Date());
    } catch {
        if (zone !== "Africa/Cairo") return startOfMonth("Africa/Cairo");
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    const hour = pick("hour");
    const minute = pick("minute");
    const second = pick("second");
    const zonedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const offset = zonedAsUtc - Date.now();
    return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - offset);
}

async function assertMonthlyAllowance(req) {
    const tenant = req.tenant;
    const limit = monthlyLimit(tenant);
    const since = startOfMonth(tenant?.settings?.locale?.timezone);
    const used = await AuditLog.countDocuments({
        action: { $in: ["whatsapp_template_sent", "whatsapp_message_sent"] },
        createdAt: { $gte: since },
    });
    if (used >= limit) {
        throw new AppError(
            "RATE_LIMITED",
            "This gym has reached its monthly WhatsApp message limit.",
            429
        );
    }
}

function forward(error, next) {
    if (error instanceof WhatsAppSessionError || error?.code === "WHATSAPP_NOT_CONNECTED" || error?.code === "WHATSAPP_NOT_ON_WHATSAPP" || error?.code === "WHATSAPP_TIMEOUT" || error?.code === "VALIDATION_FAILED") {
        if (error instanceof AppError) return next(error);
        const status = error.code === "WHATSAPP_TIMEOUT" ? 504 : 400;
        return next(new AppError(error.code, error.message, status));
    }
    return next(error);
}

const getSession = async (req, res, next) => {
    try {
        const status = await getSessionStatus(actor(req));
        res.status(200).json(status);
    } catch (error) {
        forward(error, next);
    }
};

const start = async (req, res, next) => {
    try {
        const status = await startSession(actor(req));
        res.status(200).json(status);
    } catch (error) {
        forward(error, next);
    }
};

const logout = async (req, res, next) => {
    try {
        const status = await logoutSession(actor(req));
        res.status(200).json(status);
    } catch (error) {
        forward(error, next);
    }
};

const sendMessage = async (req, res, next) => {
    try {
        assertTemplateSendAllowed(req.user);
        await assertMonthlyAllowance(req);
        const { phone, text, memberId, memberName, templateId } = req.body;
        await sendText({ ...actor(req), phone, text });

        const template = templateId
            ? await WhatsAppTemplate.findById(templateId).select("name type")
            : null;
        await writeAudit({
            action: "whatsapp_template_sent",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: memberId != null ? String(memberId) : null,
            meta: {
                memberName: memberName || null,
                templateId: template?._id?.toString() || templateId || null,
                templateName: template?.name || null,
                templateType: template?.type || null,
            },
            req,
        });

        res.status(200).json({ message: "Sent" });
    } catch (error) {
        forward(error, next);
    }
};

const sendImageMessage = async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            throw new AppError("UPLOAD_INVALID_TYPE", "Choose an image to send.");
        }
        const mime = detectMimeFromBuffer(req.file.buffer);
        if (!mime || !IMAGE_ONLY.has(mime)) {
            throw new AppError("UPLOAD_INVALID_TYPE", "WhatsApp image must be a png, jpeg, or webp.");
        }
        await assertMonthlyAllowance(req);
        const { phone, caption, memberId, memberName, kind, code } = req.body;
        const sendResult = await sendImage({
            ...actor(req),
            phone,
            image: req.file.buffer,
            caption,
        });

        let memberObj = null;
        let lastQrSentAt = null;
        if (memberId) {
            try {
                memberObj = await findMemberByIdentifier(memberId);
                if (memberObj) {
                    lastQrSentAt = new Date();
                    memberObj.lastQrSentAt = lastQrSentAt;
                    if (kind === "qr_checkin" || code) {
                        if (!Array.isArray(memberObj.userlog)) memberObj.userlog = [];
                        memberObj.userlog.push({
                            type: "other",
                            text: `Check-in QR code (${code || memberObj.systemId || ""}) sent via WhatsApp to ${phone}`,
                            user: req.user?.id || null,
                        });
                    }
                    await memberObj.save();
                }
            } catch (memberErr) {
                // Member tracking failure should not block message response
            }
        }

        const isQr = kind === "qr_checkin" || Boolean(code);
        await writeAudit({
            action: isQr ? "whatsapp_qr_sent" : "whatsapp_message_sent",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: memberObj?._id ? String(memberObj._id) : (memberId != null ? String(memberId) : null),
            meta: {
                memberName: memberName || memberObj?.name || null,
                kind: isQr ? "qr_checkin" : "image",
                code: code || memberObj?.systemId || null,
                messageId: sendResult?.messageId || null,
                sentAt: new Date(),
            },
            req,
        });

        res.status(200).json({
            message: "Sent",
            messageId: sendResult?.messageId || null,
            lastQrSentAt: lastQrSentAt || new Date(),
        });
    } catch (error) {
        forward(error, next);
    }
};

module.exports = {
    getSession,
    start,
    logout,
    sendMessage,
    sendImageMessage,
};
