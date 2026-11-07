const Member = require("../models/Member");
const logger = require("./logger");
const { runAsPlatform } = require("../context/tenantContext");

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
                    // No active freeze record but status is frozen — fix it
                    member.status = "active";
                    await member.save();
                    unfrozenCount++;
                    continue;
                }

                const freezeEnd = new Date(activeFreeze.endDate);
                if (freezeEnd <= now) {
                    // Freeze period has ended — reactivate
                    member.status = "active";

                    // Extend subscription by the freeze duration
                    const currentSub = member.subscriptions?.at(-1);
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
 * Start all scheduled tasks
 */
function startScheduledTasks() {
    // Run immediately on startup
    processFreezeCycles();
    processExpiryCycles();

    // Then every 30 minutes
    setInterval(processFreezeCycles, 30 * 60 * 1000);
    setInterval(processExpiryCycles, 30 * 60 * 1000);

    // BI snapshots are hourly and idempotent. Platform rollup is daily.
    // Delayed so a process that is only running tests does not need a database at import time.
    setTimeout(runAnalyticsJobs, 60 * 1000);
    setInterval(runAnalyticsJobs, 60 * 60 * 1000);

    logger.info("scheduler", "Scheduled tasks started (freeze + expiry every 30 min, analytics hourly)");
}

function runAnalyticsJobs() {
    const hour = new Date().getUTCHours();
    const { runDueBiSnapshots } = require("../services/bi/snapshotJob");
    runDueBiSnapshots().catch((error) => {
        logger.error("bi", "Snapshot run failed", { error: error.message });
    });
    if (hour === 0) {
        const { computeDailySnapshot } = require("../services/platformAnalyticsService");
        computeDailySnapshot().catch((error) => {
            logger.error("platform", "Platform snapshot failed", { error: error.message });
        });
    }
}

module.exports = { startScheduledTasks, processFreezeCycles, processExpiryCycles, runAnalyticsJobs };
