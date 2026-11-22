const {
    findActiveSubscriptions,
    subscriptionActivityType,
} = require("./subscriptionUtils");
const { isMemberRestricted } = require("./memberRestriction");

const MEMBERSHIP_ACTIVITY_TYPES = [
    "gym",
    "crossfit",
    "box",
    "mma",
    "kickboxing",
    "calisthenics",
];
const CHECK_IN_TYPES = [...MEMBERSHIP_ACTIVITY_TYPES, "pt"];
const COACH_ROLES = ["Coach", "Head Coach"];

/** Activity type or "pt". Anything else (including missing) returns null. */
function normalizeCheckInType(value) {
    const key = String(value ?? "").trim().toLowerCase();
    return CHECK_IN_TYPES.includes(key) ? key : null;
}

function isMembershipCheckInType(type) {
    return MEMBERSHIP_ACTIVITY_TYPES.includes(type);
}

function ptSessionsLeft(member) {
    return Math.max(0, (Number(member?.PT_sessions) || 0) - (Number(member?.used_PT_sessions) || 0));
}

function defaultDayStart(now) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day;
}

/** One entry per active membership category currently covering now. */
function activePackageOptions(member, now = new Date()) {
    if (!member?.isMember) return [];
    const byType = new Map();
    for (const sub of findActiveSubscriptions(member.subscriptions, now)) {
        const activityType = subscriptionActivityType(sub);
        if (byType.has(activityType)) continue;
        byType.set(activityType, {
            activityType,
            packageName: sub.packageSnapshot?.name || (sub.package && typeof sub.package === "object" ? sub.package.name : null) || null,
            endsAt: sub.endDate || null,
        });
    }
    return [...byType.values()];
}

/** Ordered check-in keys the desk may pick: membership activity types, then pt. */
function checkInChoiceKeys(options) {
    const keys = (options?.packages || []).map((pkg) => pkg.activityType);
    if (options?.pt) keys.push("pt");
    return keys;
}

/**
 * What a member can be checked in for right now.
 * packages = active membership categories. pt = an active PT pack with sessions left,
 * which stays valid through its last day.
 * `gym` stays true when any membership package is active (legacy callers).
 */
function checkInOptions(member, { now = new Date(), dayStart, ptEnabled = true } = {}) {
    if (!member || isMemberRestricted(member)) {
        return {
            gym: false,
            pt: false,
            packages: [],
            ptSessionsLeft: ptSessionsLeft(member),
        };
    }
    const packages = activePackageOptions(member, now);
    const gym = packages.length > 0;
    const exp = member.PT_sessions_expDate ? new Date(member.PT_sessions_expDate) : null;
    const ptExpired = Boolean(exp && !Number.isNaN(exp.getTime()) && exp < (dayStart || defaultDayStart(now)));
    const pt = Boolean(
        ptEnabled
        && member.couch_subscription_status === "active"
        && ptSessionsLeft(member) > 0
        && !ptExpired,
    );
    return { gym, pt, packages, ptSessionsLeft: ptSessionsLeft(member), ptExpired };
}

module.exports = {
    CHECK_IN_TYPES,
    MEMBERSHIP_ACTIVITY_TYPES,
    COACH_ROLES,
    normalizeCheckInType,
    isMembershipCheckInType,
    ptSessionsLeft,
    activePackageOptions,
    checkInChoiceKeys,
    checkInOptions,
};
