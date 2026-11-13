/**
 * Shared helpers for plan billing durations.
 * cycle = unit (monthly | yearly | lifetime); intervalCount = how many units.
 */

function normalizeIntervalCount(intervalCount) {
    const n = Number(intervalCount);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
}

/**
 * Convert cycle + intervalCount into entitlement months (30-day months convention).
 */
function periodMonths(cycle, intervalCount = 1) {
    const count = normalizeIntervalCount(intervalCount);
    if (cycle === "lifetime") return null;
    if (cycle === "yearly") return count * 12;
    return count;
}

/**
 * Human-readable duration label, e.g. "3 months", "2 years", "1 month".
 */
function formatDurationLabel(cycle, intervalCount = 1) {
    const count = normalizeIntervalCount(intervalCount);
    if (cycle === "lifetime") return "Lifetime";
    if (cycle === "yearly") {
        return count === 1 ? "1 year" : `${count} years`;
    }
    return count === 1 ? "1 month" : `${count} months`;
}

/**
 * Stable key for a duration SKU (used in UI selection / tabs).
 */
function durationKey(cycle, intervalCount = 1) {
    return `${cycle}:${normalizeIntervalCount(intervalCount)}`;
}

module.exports = {
    normalizeIntervalCount,
    periodMonths,
    formatDurationLabel,
    durationKey,
};
