const crypto = require("crypto");
const SchedulerLock = require("../models/SchedulerLock");
const logger = require("./logger");

/** Unique per process, so a lock row shows which instance ran a job. */
const INSTANCE_ID = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

/**
 * Try to claim `name` until now + holdMs. Resolves true when this instance
 * owns the run, false when another instance already claimed the window.
 */
async function acquireLock(name, holdMs, now = new Date()) {
    try {
        await SchedulerLock.findOneAndUpdate(
            { _id: name, expiresAt: { $lte: now } },
            { $set: { owner: INSTANCE_ID, lockedAt: now, expiresAt: new Date(now.getTime() + holdMs) } },
            { upsert: true }
        );
        return true;
    } catch (error) {
        // The row exists and is still held: the upsert insert collides on _id.
        if (error?.code === 11000) return false;
        throw error;
    }
}

async function releaseLock(name) {
    try {
        await SchedulerLock.updateOne({ _id: name, owner: INSTANCE_ID }, { $set: { expiresAt: new Date(0) } });
    } catch (error) {
        logger.warn("scheduler", "Could not release job lock", { job: name, error: error.message });
    }
}

/**
 * Run `fn` at most once per `minIntervalMs` across every running instance.
 * The claim is held for the whole window (not released on success), so an
 * overlapping deploy or a second replica skips the tick. If `fn` throws, the
 * claim is released so the next tick can retry.
 * If the lock store itself is unreachable we run anyway: jobs are idempotent
 * and skipping them would be worse than a duplicate run.
 */
async function runExclusive(name, minIntervalMs, fn) {
    let owned;
    try {
        owned = await acquireLock(name, Math.floor(minIntervalMs * 0.9));
    } catch (error) {
        logger.warn("scheduler", "Job lock unavailable, running without it", { job: name, error: error.message });
        return fn();
    }
    if (!owned) return undefined;
    try {
        return await fn();
    } catch (error) {
        await releaseLock(name);
        throw error;
    }
}

module.exports = { INSTANCE_ID, acquireLock, releaseLock, runExclusive };
