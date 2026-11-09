const AuditLog = require("../models/AuditLog");
const { isPlatformContext } = require("../context/tenantContext");
const { AppError } = require("./errors");

const WHATSAPP_AUDIT_ACTIONS = Object.freeze([
    "whatsapp_template_sent",
    "whatsapp_message_sent",
    "whatsapp_qr_sent",
]);

const allowanceCache = new Map();
const ALLOWANCE_CACHE_TTL_MS = 30000;

function clearAllowanceCache() {
    allowanceCache.clear();
}

function incrementCachedAllowance(tenantId) {
    if (!tenantId) return;
    const entry = allowanceCache.get(String(tenantId));
    if (entry) {
        entry.used += 1;
    }
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

function getMonthlyWhatsAppLimit(tenant, plan) {
    const isLifetime = tenant?.billing?.cycle === "lifetime";
    if (isLifetime) {
        return tenant?.billing?.lifetime?.fairUseLimits?.whatsappMessagesMonthlyLimit || 2000;
    }
    const effectivePlan = (tenant?.planId && typeof tenant.planId === "object" && tenant.planId.fairUseCaps)
        ? tenant.planId
        : plan;
    return effectivePlan?.fairUseCaps?.whatsappMessagesMonthly ?? 2000;
}

async function countMonthlyWhatsAppMessages(tenantId, timeZone) {
    const since = startOfMonth(timeZone);
    const filter = {
        action: { $in: WHATSAPP_AUDIT_ACTIONS },
        createdAt: { $gte: since },
    };
    if (tenantId) {
        filter.tenantId = tenantId;
    }
    return await AuditLog.countDocuments(filter);
}

async function assertMonthlyAllowance(req) {
    const tenant = req.tenant;
    const limit = getMonthlyWhatsAppLimit(tenant, req.plan);
    const tenantId = String(tenant?._id || req.user?.tenantId);
    const now = Date.now();
    const cached = allowanceCache.get(tenantId);
    const timezone = tenant?.settings?.locale?.timezone || "Africa/Cairo";
    const since = startOfMonth(timezone);
    let used;

    if (cached && (now - cached.timestamp < ALLOWANCE_CACHE_TTL_MS) && cached.since === since.getTime()) {
        used = cached.used;
    } else {
        used = await countMonthlyWhatsAppMessages(tenantId, timezone);
        allowanceCache.set(tenantId, { used, timestamp: now, since: since.getTime() });
    }

    if (used >= limit) {
        throw new AppError(
            "RATE_LIMITED",
            "This gym has reached its monthly WhatsApp message limit.",
            429
        );
    }
}

module.exports = {
    WHATSAPP_AUDIT_ACTIONS,
    ALLOWANCE_CACHE_TTL_MS,
    clearAllowanceCache,
    incrementCachedAllowance,
    startOfMonth,
    getMonthlyWhatsAppLimit,
    countMonthlyWhatsAppMessages,
    assertMonthlyAllowance,
};
