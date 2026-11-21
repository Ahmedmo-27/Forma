const { hasAccess } = require("./accessControl");

const FEATURE_TRIAL_ACCESS_KEY = "request_feature_trials";
const DEFAULT_ROLES = new Set(["Owner", "General Manager"]);

/**
 * Owner and GM always can; other staff need the Access Control grant.
 * `user.access` is the resolved key list from auth; fall back to hasAccess helper.
 */
function canRequestFeatureTrials(user) {
    if (!user) return false;
    if (DEFAULT_ROLES.has(user.role)) return true;
    if (Array.isArray(user.access) && user.access.includes(FEATURE_TRIAL_ACCESS_KEY)) {
        return true;
    }
    return hasAccess(user, FEATURE_TRIAL_ACCESS_KEY);
}

function canSeeLockedFeatures(user) {
    return canRequestFeatureTrials(user);
}

/** Normalize duration to whole days for storage / trialEndsAt math. */
function durationToDays(value, unit) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return null;
    if (unit === "weeks") {
        if (n > 12) return null;
        return n * 7;
    }
    if (unit === "days") {
        if (n > 90) return null;
        return n;
    }
    return null;
}

function addDays(from, days) {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

module.exports = {
    FEATURE_TRIAL_ACCESS_KEY,
    canRequestFeatureTrials,
    canSeeLockedFeatures,
    durationToDays,
    addDays,
};
