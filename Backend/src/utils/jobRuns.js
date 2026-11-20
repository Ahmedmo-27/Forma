const mongoose = require("mongoose");
const ScheduledJobRun = require("../models/ScheduledJobRun");
const logger = require("./logger");
const { INSTANCE_ID } = require("./schedulerLock");

/** Small JSON-safe summary of a job's return value for the health page. */
function summarizeResult(result) {
    if (result == null) return null;
    if (typeof result === "number" || typeof result === "boolean" || typeof result === "string") return result;
    if (typeof result === "object" && !Array.isArray(result)) {
        const out = {};
        for (const [key, value] of Object.entries(result).slice(0, 12)) {
            if (value == null || ["number", "boolean", "string"].includes(typeof value)) out[key] = value;
        }
        return out;
    }
    return null;
}

function dbReady() {
    return mongoose.connection.readyState === 1;
}

async function recordStart(name, intervalMs, startedAt = new Date()) {
    if (!dbReady()) return;
    try {
        await ScheduledJobRun.updateOne(
            { _id: name },
            { $set: { status: "running", instance: INSTANCE_ID, intervalMs, lastStartedAt: startedAt } },
            { upsert: true }
        );
    } catch (error) {
        logger.warn("scheduler", "Could not record job start", { job: name, error: error.message });
    }
}

async function recordFinish(name, { startedAt, error = null, result = null }) {
    if (!dbReady()) return;
    const finishedAt = new Date();
    const set = {
        status: error ? "failed" : "success",
        lastFinishedAt: finishedAt,
        lastDurationMs: finishedAt.getTime() - new Date(startedAt).getTime(),
    };
    if (error) {
        set.lastFailureAt = finishedAt;
        set.lastError = String(error.message || error).slice(0, 500);
    } else {
        set.lastSuccessAt = finishedAt;
        set.lastError = null;
        set.lastResult = summarizeResult(result);
    }
    try {
        await ScheduledJobRun.updateOne(
            { _id: name },
            { $set: set, $inc: { runCount: 1, failureCount: error ? 1 : 0 } },
            { upsert: true }
        );
    } catch (err) {
        logger.warn("scheduler", "Could not record job finish", { job: name, error: err.message });
    }
}

/**
 * Status of every job for the health page. A job is "overdue" when its last
 * success is older than three intervals (or it never succeeded after a start).
 */
async function listJobRuns(now = new Date()) {
    if (!dbReady()) return [];
    const rows = await ScheduledJobRun.find().sort({ _id: 1 }).lean();
    return rows.map((row) => {
        const interval = row.intervalMs || null;
        const lastSuccess = row.lastSuccessAt ? new Date(row.lastSuccessAt).getTime() : null;
        const overdue = Boolean(interval) && (lastSuccess == null || now.getTime() - lastSuccess > interval * 3);
        return {
            name: row._id,
            status: row.status,
            instance: row.instance,
            intervalMs: interval,
            lastStartedAt: row.lastStartedAt,
            lastFinishedAt: row.lastFinishedAt,
            lastSuccessAt: row.lastSuccessAt,
            lastFailureAt: row.lastFailureAt,
            lastDurationMs: row.lastDurationMs,
            lastError: row.lastError,
            lastResult: row.lastResult,
            runCount: row.runCount || 0,
            failureCount: row.failureCount || 0,
            overdue,
        };
    });
}

module.exports = { recordStart, recordFinish, listJobRuns, summarizeResult };
