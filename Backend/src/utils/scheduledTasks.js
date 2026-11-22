const Member = require("../models/Member");
const logger = require("./logger");
const { isClosedSubscription } = require("./subscriptionUtils");
const { runAsPlatform, runWithTenant } = require("../context/tenantContext");
const { runExclusive } = require("./schedulerLock");
const { recordStart, recordFinish } = require("./jobRuns");
const monitoring = require("../services/monitoring");

/**
 * Expire members whose last subscription endDate has passed
 * and whose status is still "active" or "frozen".
 * Uses a single updateMany for performance — no looping.
 */
async function processExpiryCycles() {
    return runAsPlatform(async () => {
        const now = new Date();
        try {
            // Find all active/frozen members where last subscription endDate <= now
            // We can't use updateMany directly on nested array last element,
            // so we aggregate to get IDs then bulk update.
            const overdueIds = await Member.aggregate([
                {
                    $match: {
                        status: { $in: ["active", "frozen"] },
                        isMember: true,
                        "subscriptions.0": { $exists: true },
                    },
                },
                {
                    $addFields: {
                        lastSubEnd: { $arrayElemAt: ["$subscriptions.endDate", -1] },
                    },
                },
                {
                    $match: { lastSubEnd: { $lt: now } },
                },
                { $project: { _id: 1 } },
            ]);

            if (overdueIds.length === 0) return;

            const ids = overdueIds.map(d => d._id);
            const result = await Member.updateMany(
                { _id: { $in: ids } },
                { $set: { status: "expired" } }
            );

            if (result.modifiedCount > 0) {
                logger.info("scheduler", "Expiry cycle processed", { expiredCount: result.modifiedCount });
            }
        } catch (error) {
            logger.error("scheduler", "Expiry cycle error", { error: error.message });
        }
    }, { reason: "scheduled_expiry_cycle" });
}

/**
 * Unfreeze members whose freeze end date has passed.
 * Also handles future-scheduled freezes that should now start.
 */
async function processFreezeCycles() {
    return runAsPlatform(async () => {
        const now = new Date();

        try {
            // 1. Unfreeze: members with status "frozen" whose latest freeze endDate <= now
            const frozenMembers = await Member.find({ status: "frozen" });

            let unfrozenCount = 0;
            for (const member of frozenMembers) {
                const activeFreeze = member.freeze
                    .filter(f => !f.endedBy)
                    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];

                if (!activeFreeze) {
                    const currentSub = member.subscriptions?.at(-1);
                    member.status = isClosedSubscription(currentSub) ? "expired" : "active";
                    await member.save();
                    unfrozenCount++;
                    continue;
                }

                const freezeEnd = new Date(activeFreeze.endDate);
                if (freezeEnd <= now) {
                    const currentSub = member.subscriptions?.at(-1);
                    if (isClosedSubscription(currentSub)) {
                        member.status = "expired";
                        await member.save();
                        unfrozenCount++;
                        continue;
                    }

                    // Freeze period has ended — reactivate
                    member.status = "active";

                    // Extend subscription by the freeze duration
                    if (currentSub) {
                        const freezeStart = new Date(activeFreeze.startDate);
                        const frozenDays = Math.ceil((freezeEnd - freezeStart) / 86400000);
                        const subEnd = new Date(currentSub.endDate);
                        subEnd.setDate(subEnd.getDate() + frozenDays);
                        currentSub.endDate = subEnd;
                    }

                    const actorId = member.assignedSales || member.createdBy || activeFreeze.createdBy;
                    if (actorId) {
                        member.userlog.push({
                            type: "other",
                            text: `Freeze ended automatically. Subscription extended.`,
                            createdBy: actorId,
                        });
                    }

                    await member.save();
                    unfrozenCount++;
                }
            }

            // 2. Start scheduled freezes: members with status "active" who have a freeze starting today or earlier
            const activeMembers = await Member.find({
                status: "active",
                "freeze.startDate": { $lte: now },
            });

            let frozenCount = 0;
            for (const member of activeMembers) {
                // Find a freeze that started but hasn't ended yet (no endedBy) and member is still active
                const pendingFreeze = member.freeze
                    .filter(f => !f.endedBy && new Date(f.startDate) <= now && new Date(f.endDate) > now)
                    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];

                if (pendingFreeze && member.status === "active") {
                    member.status = "frozen";
                    await member.save();
                    frozenCount++;
                }
            }

            if (unfrozenCount > 0 || frozenCount > 0) {
                logger.info("scheduler", "Freeze cycle processed", { unfrozenCount, frozenCount });
            }
        } catch (error) {
            logger.error("scheduler", "Freeze cycle error", { error: error.message });
        }
    }, { reason: "scheduled_freeze_cycle" });
}

/**
 * Lift timed suspensions whose suspendedUntil has passed.
 */
async function processSuspensionLifts() {
    const { clearRestrictionFields } = require("./memberRestriction");
    return runAsPlatform(async () => {
        const now = new Date();
        try {
            const expired = await Member.find({
                isBlocked: true,
                restrictionType: "suspend",
                suspendedUntil: { $lte: now },
            }).select("_id name systemId userlog");

            let lifted = 0;
            for (const member of expired) {
                clearRestrictionFields(member);
                member.userlog.push({
                    type: "other",
                    text: "Suspension ended automatically",
                    createdBy: null,
                });
                await member.save();
                lifted += 1;
            }

            if (lifted > 0) {
                logger.info("scheduler", "Suspension lifts processed", { liftedCount: lifted });
            }
        } catch (error) {
            logger.error("scheduler", "Suspension lift cycle error", { error: error.message });
        }
    }, { reason: "scheduled_suspension_lift" });
}

/**
 * Members with no sales rep belong to that gym's primary sales manager.
 * Runs per tenant so the tenant plugin does not assign one manager across gyms.
 */
async function assignOpenMembers() {
    const Tenant = require("../models/Tenant");
    const { assignOpenMembersToSalesManager } = require("./salesAssignment");
    const { assignOpenMembersToHeadCoach } = require("./coachAssignment");
    try {
        const tenants = await runAsPlatform(() => Tenant.find().select("_id slug").lean());
        for (const tenant of tenants) {
            await runWithTenant(
                { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                async () => {
                    await assignOpenMembersToSalesManager();
                    await assignOpenMembersToHeadCoach();
                }
            );
        }
    } catch (error) {
        logger.error("scheduler", "Sales assignment cycle error", { error: error.message });
    }
}

/**
 * Start all scheduled tasks
 */
const HALF_HOUR_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Timer handles so a graceful shutdown can stop every job. */
const timers = [];

function every(ms, fn) {
    const handle = setInterval(fn, ms);
    timers.push(handle);
    return handle;
}

function later(ms, fn) {
    const handle = setTimeout(fn, ms);
    timers.push(handle);
    return handle;
}

/**
 * Wrap a job so only one instance runs it per interval (overlapping deploys,
 * replicas) and record its last run for the platform health page. The wrapped
 * job never rejects: failures are logged and reported to monitoring.
 */
function exclusive(name, intervalMs, job) {
    return async () => {
        const startedAt = new Date();
        let ran = false;
        let result;
        try {
            result = await runExclusive(name, intervalMs, async () => {
                ran = true;
                await recordStart(name, intervalMs, startedAt);
                return job();
            });
            if (ran) await recordFinish(name, { startedAt, result });
        } catch (error) {
            logger.error("scheduler", "Scheduled job failed", { job: name, error: error.message });
            monitoring.captureException(error, { tags: { area: "scheduler", job: name } });
            if (ran) await recordFinish(name, { startedAt, error });
        }
        return result;
    };
}

function runMaintenanceRemindersJob() {
    const { runMaintenanceReminders } = require("../services/maintenanceReminders");
    return runMaintenanceReminders();
}

function runDunningJob() {
    const { runDunning } = require("../services/billing/dunningService");
    return runDunning();
}

function runAuditReplayJob() {
    const { replayDeadLetters } = require("./audit");
    return replayDeadLetters();
}

function runOwnerDigestJob() {
    const { runOwnerDigests } = require("../services/ownerDigest");
    return runOwnerDigests();
}

/** Job name, interval, and runner for every scheduled task. */
const JOBS = [
    { name: "freeze_cycles", intervalMs: HALF_HOUR_MS, run: processFreezeCycles, startDelayMs: 0 },
    { name: "suspension_lifts", intervalMs: HALF_HOUR_MS, run: processSuspensionLifts, startDelayMs: 60 * 1000 },
    { name: "expiry_cycles", intervalMs: HALF_HOUR_MS, run: processExpiryCycles, startDelayMs: 0 },
    { name: "assign_open_members", intervalMs: HALF_HOUR_MS, run: assignOpenMembers, startDelayMs: 0 },
    // BI snapshots are hourly and idempotent. Platform rollup is daily (00:00 UTC).
    { name: "analytics", intervalMs: HOUR_MS, run: runAnalyticsJobs, startDelayMs: 60 * 1000 },
    { name: "owner_reminders", intervalMs: HOUR_MS, run: runOwnerReminders, startDelayMs: 90 * 1000 },
    { name: "dunning", intervalMs: HOUR_MS, run: runDunningJob, startDelayMs: 2 * 60 * 1000 },
    // Each branch is reminded at most once per MAINTENANCE_REMINDER_REPEAT_HOURS window.
    { name: "maintenance_reminders", intervalMs: HOUR_MS, run: runMaintenanceRemindersJob, startDelayMs: 2 * 60 * 1000 },
    { name: "owner_weekly_digest", intervalMs: HOUR_MS, run: runOwnerDigestJob, startDelayMs: 3 * 60 * 1000 },
    { name: "audit_dead_letter_replay", intervalMs: HOUR_MS, run: runAuditReplayJob, startDelayMs: 5 * 60 * 1000 },
];

/**
 * Start all scheduled tasks
 */
function startScheduledTasks() {
    for (const job of JOBS) {
        const tick = exclusive(job.name, job.intervalMs, job.run);
        if (job.startDelayMs > 0) later(job.startDelayMs, tick);
        else tick();
        every(job.intervalMs, tick);
    }

    logger.info("scheduler", "Scheduled tasks started", { jobs: JOBS.map((job) => job.name) });
}

/** Stop every scheduled job (used by graceful shutdown). */
function stopScheduledTasks() {
    while (timers.length) {
        const handle = timers.pop();
        clearInterval(handle);
        clearTimeout(handle);
    }
}

async function runOwnerReminders() {
    const { runOwnerReminders: sendDueReminders } = require("../services/ownerMail");
    try {
        return await sendDueReminders();
    } catch (error) {
        logger.error("mail", "Owner reminder run failed", { error: error.message });
        throw error;
    }
}

async function runAnalyticsJobs() {
    const hour = new Date().getUTCHours();
    const { runDueBiSnapshots } = require("../services/bi/snapshotJob");
    const tasks = [
        runDueBiSnapshots().catch((error) => {
            logger.error("bi", "Snapshot run failed", { error: error.message });
            throw error;
        }),
    ];
    if (hour === 0) {
        const { computeDailySnapshot } = require("../services/platformAnalyticsService");
        tasks.push(computeDailySnapshot().catch((error) => {
            logger.error("platform", "Platform snapshot failed", { error: error.message });
            throw error;
        }));
    }
    const results = await Promise.allSettled(tasks);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
    return { gymSnapshots: results[0].value ?? null, platformSnapshot: hour === 0 };
}

module.exports = { JOBS, exclusive, startScheduledTasks, stopScheduledTasks, runMaintenanceRemindersJob, processFreezeCycles, processExpiryCycles, assignOpenMembers, runAnalyticsJobs, runOwnerReminders };
