const Tenant = require("../models/Tenant");
const User = require("../models/User");
const PlatformSetting = require("../models/PlatformSetting");
const EmailDelivery = require("../models/EmailDelivery");
const mailer = require("./mailer");
const logger = require("../utils/logger");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_DAYS = [3, 1];

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

function normalizeReminderDays(value) {
    const days = Array.isArray(value) ? value.map(Number).filter((day) => day > 0) : [];
    return days.length ? days : DEFAULT_REMINDER_DAYS;
}

async function loadReminderDays() {
    const setting = await PlatformSetting.findOne({ key: "dunning_schedule" }).lean();
    return normalizeReminderDays(setting?.value?.reminderDays);
}

async function ownerOf(tenant) {
    const owner = tenant.ownerUserId;
    if (owner && typeof owner === "object" && owner.email) return owner;
    if (!owner) return null;
    return User.findById(owner).select("name email");
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

async function sendReminder({ kind, tenant, daysLeft, send }) {
    const window = String(daysLeft);
    const claimed = await claimDelivery(kind, tenant._id, window);
    if (!claimed) return;
    try {
        const result = await sendToOwner(tenant, send);
        if (!result || result.skipped) {
            await releaseDelivery(kind, tenant._id, window);
            return;
        }
        const owner = await ownerOf(tenant);
        await finishDelivery(kind, tenant._id, window, owner?.email || "");
    } catch (error) {
        await releaseDelivery(kind, tenant._id, window);
        logger.warn("mail", "Reminder email failed", { kind, error: error.message });
    }
}

async function runOwnerReminders(now = new Date()) {
    const reminderDays = await loadReminderDays();
    const maxDay = Math.max(...reminderDays);
    const horizon = new Date(now.getTime() + maxDay * DAY_MS);
    const appUrl = appOrigin();

    const trials = await Tenant.find({
        status: "trial",
        trialEndsAt: { $gt: now, $lte: horizon },
    }).select("name trialEndsAt ownerUserId");

    for (const tenant of trials) {
        const daysLeft = daysUntil(tenant.trialEndsAt, now);
        if (!reminderDays.includes(daysLeft)) continue;
        await sendReminder({
            kind: "trial_ending",
            tenant,
            daysLeft,
            send: (owner) => mailer.sendTrialEnding({
                to: owner.email,
                name: owner.name,
                gymName: tenant.name,
                daysLeft,
                appUrl,
            }),
        });
    }

    const billing = await Tenant.find({
        status: { $in: ["active", "past_due"] },
        currentPeriodEnd: { $gt: now, $lte: horizon },
    }).select("name currentPeriodEnd ownerUserId");

    for (const tenant of billing) {
        const daysLeft = daysUntil(tenant.currentPeriodEnd, now);
        if (!reminderDays.includes(daysLeft)) continue;
        await sendReminder({
            kind: "payment_reminder",
            tenant,
            daysLeft,
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
    notifyPaymentRejected,
    notifySuspended,
    runOwnerReminders,
};
