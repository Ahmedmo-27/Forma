const Tenant = require("../models/Tenant");
const User = require("../models/User");
const PlatformSetting = require("../models/PlatformSetting");
const EmailDelivery = require("../models/EmailDelivery");
const mailer = require("./mailer");
const logger = require("../utils/logger");
const { runAsPlatform } = require("../context/tenantContext");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_DAYS = [3, 1];
const DEFAULT_TRIAL_REMINDER_DAYS = [7, 3, 1];
const DEFAULT_GRACE_DAYS = 3;

function appOrigin() {
    return (process.env.FRONTEND_ORIGIN || "https://app.forma-official.com")
        .split(",")[0]
        .trim()
        .replace(/\/+$/, "");
}

function offerUrl() {
    return (process.env.PAYMENT_GATEWAY_URL || appOrigin()).replace(/\/+$/, "");
}

function daysUntil(date, now = new Date()) {
    const target = new Date(date);
    if (Number.isNaN(target.getTime())) return null;
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) return null;
    return Math.ceil(diff / DAY_MS);
}

function normalizeReminderDays(value, fallback = DEFAULT_REMINDER_DAYS) {
    const days = Array.isArray(value) ? value.map(Number).filter((day) => day > 0) : [];
    return days.length ? days : fallback;
}

function normalizeOffsets(value, fallback) {
    const days = Array.isArray(value) ? value.map(Number).filter((day) => Number.isInteger(day) && day >= 0) : [];
    return days.length ? days : fallback;
}

/**
 * `dunning_schedule` platform setting with defaults:
 * reminderDays (before period end), trialReminderDays (before trial end),
 * gracePeriodDays (past due until suspension), overdueReminderDays (days after going past due).
 */
async function loadDunningSchedule() {
    const setting = await PlatformSetting.findOne({ key: "dunning_schedule" }).lean();
    const value = setting?.value || {};
    const grace = Number(value.gracePeriodDays);
    const gracePeriodDays = Number.isFinite(grace) && grace >= 0 ? Math.floor(grace) : DEFAULT_GRACE_DAYS;
    return {
        reminderDays: normalizeReminderDays(value.reminderDays),
        trialReminderDays: normalizeReminderDays(value.trialReminderDays, DEFAULT_TRIAL_REMINDER_DAYS),
        gracePeriodDays,
        overdueReminderDays: normalizeOffsets(value.overdueReminderDays, [0, Math.max(0, gracePeriodDays - 1)]),
    };
}

/** Dedupe window: the target date plus the offset, so each billing cycle gets its own reminders. */
function reminderWindow(targetDate, offset) {
    const day = new Date(targetDate);
    const key = Number.isNaN(day.getTime()) ? "unknown" : day.toISOString().slice(0, 10);
    return `${key}:${offset}`;
}

async function ownerOf(tenant) {
    const owner = tenant.ownerUserId;
    if (owner && typeof owner === "object" && owner.email) return owner;
    if (!owner) return null;
    // User is tenant-scoped; scheduled jobs run without a tenant context.
    return runAsPlatform(() => User.findById(owner).select("name email"), { reason: "owner_mail_recipient" });
}

async function sendToOwner(tenant, send) {
    const owner = await ownerOf(tenant);
    if (!owner?.email) return { skipped: true, reason: "missing_recipient" };
    return send(owner);
}

async function notifyPaymentRejected(payment, reason) {
    try {
        const tenant = await Tenant.findById(payment.tenantId).select("name ownerUserId");
        if (!tenant) return;
        await sendToOwner(tenant, (owner) => mailer.sendPaymentRejected({
            to: owner.email,
            name: owner.name,
            gymName: tenant.name,
            reason,
            appUrl: appOrigin(),
        }));
    } catch (error) {
        logger.warn("mail", "Payment rejected email failed", { error: error.message });
    }
}

async function notifySuspended(tenant) {
    try {
        await sendToOwner(tenant, (owner) => mailer.sendAccountSuspended({
            to: owner.email,
            name: owner.name,
            gymName: tenant.name,
            appUrl: appOrigin(),
        }));
    } catch (error) {
        logger.warn("mail", "Suspension email failed", { error: error.message });
    }
}

async function claimDelivery(kind, tenantId, window) {
    try {
        await EmailDelivery.create({ kind, tenantId, window, status: "pending" });
        return true;
    } catch (error) {
        if (error.code === 11000) return false;
        throw error;
    }
}

async function finishDelivery(kind, tenantId, window, to) {
    await EmailDelivery.updateOne(
        { kind, tenantId, window },
        { $set: { status: "sent", to, sentAt: new Date() } }
    );
}

async function releaseDelivery(kind, tenantId, window) {
    await EmailDelivery.deleteOne({ kind, tenantId, window, status: "pending" });
}

/**
 * Send one deduplicated owner email. `window` defaults to the offset; pass a
 * date-keyed window (see reminderWindow) for anything that repeats per cycle.
 * Resolves true when an email went out.
 */
async function sendReminder({ kind, tenant, daysLeft, window = String(daysLeft), send }) {
    const claimed = await claimDelivery(kind, tenant._id, window);
    if (!claimed) return false;
    try {
        const result = await sendToOwner(tenant, send);
        if (!result || result.skipped) {
            await releaseDelivery(kind, tenant._id, window);
            return false;
        }
        const owner = await ownerOf(tenant);
        await finishDelivery(kind, tenant._id, window, owner?.email || "");
        return true;
    } catch (error) {
        await releaseDelivery(kind, tenant._id, window);
        logger.warn("mail", "Reminder email failed", { kind, error: error.message });
        return false;
    }
}

async function runOwnerReminders(now = new Date()) {
    const { reminderDays, trialReminderDays } = await loadDunningSchedule();
    const appUrl = appOrigin();

    const trialHorizon = new Date(now.getTime() + Math.max(...trialReminderDays) * DAY_MS);
    const trials = await Tenant.find({
        status: "trial",
        trialEndsAt: { $gt: now, $lte: trialHorizon },
    }).select("name trialEndsAt ownerUserId");

    for (const tenant of trials) {
        const daysLeft = daysUntil(tenant.trialEndsAt, now);
        if (!trialReminderDays.includes(daysLeft)) continue;
        await sendReminder({
            kind: "trial_ending",
            tenant,
            daysLeft,
            window: reminderWindow(tenant.trialEndsAt, daysLeft),
            send: (owner) => mailer.sendTrialEnding({
                to: owner.email,
                name: owner.name,
                gymName: tenant.name,
                daysLeft,
                appUrl,
            }),
        });
    }

    const billingHorizon = new Date(now.getTime() + Math.max(...reminderDays) * DAY_MS);
    const billing = await Tenant.find({
        status: { $in: ["active", "past_due"] },
        "billing.cycle": { $ne: "lifetime" },
        currentPeriodEnd: { $gt: now, $lte: billingHorizon },
    }).select("name currentPeriodEnd ownerUserId");

    for (const tenant of billing) {
        const daysLeft = daysUntil(tenant.currentPeriodEnd, now);
        if (!reminderDays.includes(daysLeft)) continue;
        await sendReminder({
            kind: "payment_reminder",
            tenant,
            daysLeft,
            window: reminderWindow(tenant.currentPeriodEnd, daysLeft),
            send: (owner) => mailer.sendPaymentReminder({
                to: owner.email,
                name: owner.name,
                gymName: tenant.name,
                daysLeft,
                appUrl,
            }),
        });
    }
}

module.exports = {
    appOrigin,
    offerUrl,
    daysUntil,
    normalizeReminderDays,
    loadDunningSchedule,
    reminderWindow,
    ownerOf,
    sendReminder,
    notifyPaymentRejected,
    notifySuspended,
    runOwnerReminders,
};
