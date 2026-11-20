const Tenant = require("../../models/Tenant");
const logger = require("../../utils/logger");
const { runAsPlatform } = require("../../context/tenantContext");
const { invalidateTenantCache, invalidatePlatformCache } = require("../../utils/cacheInvalidator");
const { invalidateAuthContext } = require("../../middleware/authContextCache");
const { writePlatformAudit } = require("../../utils/audit");
const { processTenantExpiryCycles } = require("./tenantLifecycleService");
const ownerMail = require("../ownerMail");
const mailer = require("../mailer");

const DAY_MS = 24 * 60 * 60 * 1000;
const SYSTEM_ACTOR = "000000000000000000000000";

/** Whole days elapsed since `from`, floored at 0. */
function daysSince(from, now) {
    const start = new Date(from);
    if (Number.isNaN(start.getTime())) return 0;
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
}

function graceEnd(pastDueSince, gracePeriodDays) {
    return new Date(new Date(pastDueSince).getTime() + gracePeriodDays * DAY_MS);
}

/** Apply the past_due state to a loaded tenant document (console action). */
function applyPastDue(tenant, { now = new Date(), gracePeriodDays, markedBy = "platform" }) {
    tenant.status = "past_due";
    tenant.dunning = {
        pastDueSince: now,
        graceEndsAt: graceEnd(now, gracePeriodDays),
        suspendedAt: null,
        suspendedByDunning: false,
        markedBy,
    };
    return tenant;
}

function clearDunning(tenant) {
    tenant.dunning = { pastDueSince: null, graceEndsAt: null, suspendedAt: null, suspendedByDunning: false, markedBy: null };
    return tenant;
}

function refreshTenantCaches(tenantId) {
    invalidateTenantCache(tenantId, "tenant");
    invalidateAuthContext({ tenantId: String(tenantId) });
}

async function sendOverdueReminder(tenant, { now, schedule, appUrl }) {
    const pastDueSince = tenant.dunning?.pastDueSince;
    if (!pastDueSince) return false;
    const day = daysSince(pastDueSince, now);
    if (!schedule.overdueReminderDays.includes(day)) return false;
    const graceEndsAt = tenant.dunning?.graceEndsAt || graceEnd(pastDueSince, schedule.gracePeriodDays);
    const daysUntilSuspension = Math.max(0, Math.ceil((new Date(graceEndsAt).getTime() - now.getTime()) / DAY_MS));
    return ownerMail.sendReminder({
        kind: "payment_overdue",
        tenant,
        daysLeft: day,
        window: ownerMail.reminderWindow(pastDueSince, day),
        send: (owner) => mailer.sendPaymentOverdue({
            to: owner.email,
            name: owner.name,
            gymName: tenant.name,
            daysUntilSuspension,
            appUrl,
        }),
    });
}

async function suspendForNonPayment(tenant, now) {
    tenant.status = "suspended";
    tenant.dunning = {
        ...(tenant.dunning?.toObject ? tenant.dunning.toObject() : tenant.dunning || {}),
        suspendedAt: now,
        suspendedByDunning: true,
    };
    await tenant.save();
    refreshTenantCaches(tenant._id);
    await ownerMail.notifySuspended(tenant);
    await writePlatformAudit({
        tenantId: tenant._id,
        action: "tenant_dunning_suspended",
        actor: SYSTEM_ACTOR,
        actorRole: "system",
        targetType: "tenant",
        targetId: tenant._id.toString(),
        meta: {
            pastDueSince: tenant.dunning?.pastDueSince || null,
            graceEndsAt: tenant.dunning?.graceEndsAt || null,
        },
    });
}

/**
 * One dunning pass:
 * 1. Expire trials and move overdue recurring tenants to past_due (grace starts).
 * 2. Backfill grace dates for past_due rows created before dunning existed.
 * 3. Email overdue reminders on the configured days.
 * 4. Suspend tenants whose grace period has ended.
 * Lifetime tenants are never touched.
 */
async function runDunning(now = new Date()) {
    const schedule = await runAsPlatform(() => ownerMail.loadDunningSchedule(), { reason: "dunning_schedule" });
    const lifecycle = await processTenantExpiryCycles(now, { gracePeriodDays: schedule.gracePeriodDays });

    const summary = { ...lifecycle, remindersSent: 0, suspended: 0, backfilled: 0 };
    const appUrl = ownerMail.appOrigin();

    await runAsPlatform(async () => {
        const pastDue = await Tenant.find({
            status: "past_due",
            "billing.cycle": { $ne: "lifetime" },
            isSoftDeleted: { $ne: true },
        }).select("name status ownerUserId currentPeriodEnd dunning billing");

        for (const tenant of pastDue) {
            try {
                if (!tenant.dunning?.pastDueSince) {
                    const since = tenant.currentPeriodEnd && tenant.currentPeriodEnd < now ? tenant.currentPeriodEnd : now;
                    tenant.dunning = {
                        pastDueSince: since,
                        graceEndsAt: graceEnd(since, schedule.gracePeriodDays),
                        suspendedAt: null,
                        suspendedByDunning: false,
                        markedBy: "system",
                    };
                    await tenant.save();
                    summary.backfilled += 1;
                }

                const graceEndsAt = tenant.dunning.graceEndsAt || graceEnd(tenant.dunning.pastDueSince, schedule.gracePeriodDays);
                if (now >= new Date(graceEndsAt)) {
                    await suspendForNonPayment(tenant, now);
                    summary.suspended += 1;
                    continue;
                }

                if (await sendOverdueReminder(tenant, { now, schedule, appUrl })) summary.remindersSent += 1;
            } catch (error) {
                logger.error("dunning", "Dunning step failed for tenant", { tenantId: String(tenant._id), error: error.message });
            }
        }
    }, { reason: "scheduled_dunning" });

    if (summary.expiredTrials || summary.overdueSubscriptions || summary.suspended) {
        invalidatePlatformCache("tenants", "analytics");
        invalidateAuthContext({ all: true });
    }
    if (summary.expiredTrials || summary.overdueSubscriptions || summary.suspended || summary.remindersSent) {
        logger.info("dunning", "Dunning pass complete", summary);
    }
    return summary;
}

module.exports = { runDunning, applyPastDue, clearDunning, daysSince, graceEnd, refreshTenantCaches };
