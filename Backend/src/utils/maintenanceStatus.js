/**
 * Pure helpers that decide whether a maintenance item is ok, due, or overdue.
 * Shared by the maintenance board (controller) and the scheduled reminders so
 * both always agree on status.
 */

const MS = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
};

const DUE_SOON_RATIO = 0.1;

function intervalMs(value, unit) {
    const base = MS[unit];
    if (!base || !Number.isFinite(value) || value < 1) return null;
    return value * base;
}

function addInterval(from, value, unit) {
    const ms = intervalMs(value, unit);
    if (!ms) return null;
    return new Date(from.getTime() + ms);
}

function computeStatus(item, lastCompletedAt, now = new Date()) {
    const anchor = lastCompletedAt || item.createdAt || now;
    const nextDueAt = addInterval(new Date(anchor), item.intervalValue, item.intervalUnit);
    if (!nextDueAt) {
        return { nextDueAt: null, status: "due", lastCompletedAt: lastCompletedAt || null };
    }
    if (now.getTime() > nextDueAt.getTime()) {
        return { nextDueAt, status: "overdue", lastCompletedAt: lastCompletedAt || null };
    }
    const windowMs = Math.max(intervalMs(item.intervalValue, item.intervalUnit) * DUE_SOON_RATIO, MS.hour);
    if (nextDueAt.getTime() - now.getTime() <= windowMs) {
        return { nextDueAt, status: "due", lastCompletedAt: lastCompletedAt || null };
    }
    if (!lastCompletedAt) {
        return { nextDueAt, status: "due", lastCompletedAt: null };
    }
    return { nextDueAt, status: "ok", lastCompletedAt };
}

module.exports = {
    MS,
    DUE_SOON_RATIO,
    intervalMs,
    addInterval,
    computeStatus,
};
