const { findActiveSubscription } = require("./subscriptionUtils");

const CHECK_IN_TYPES = ["gym", "pt"];
const COACH_ROLES = ["Coach", "Head Coach"];

/** "gym" or "pt". Anything else (including missing) returns null. */
function normalizeCheckInType(value) {
    const key = String(value ?? "").trim().toLowerCase();
    return CHECK_IN_TYPES.includes(key) ? key : null;
}

function ptSessionsLeft(member) {
    return Math.max(0, (Number(member?.PT_sessions) || 0) - (Number(member?.used_PT_sessions) || 0));
}

function defaultDayStart(now) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day;
}

/**
 * What a member can be checked in for right now.
 * gym = an active regular membership. pt = an active PT pack with sessions left,
 * which stays valid through its last day.
 */
function checkInOptions(member, { now = new Date(), dayStart, ptEnabled = true } = {}) {
    if (!member || member.isBlocked) {
        return { gym: false, pt: false, ptSessionsLeft: ptSessionsLeft(member) };
    }
    const gym = Boolean(member.isMember) && Boolean(findActiveSubscription(member.subscriptions, now));
    const exp = member.PT_sessions_expDate ? new Date(member.PT_sessions_expDate) : null;
    const ptExpired = Boolean(exp && !Number.isNaN(exp.getTime()) && exp < (dayStart || defaultDayStart(now)));
    const pt = Boolean(
        ptEnabled
        && member.couch_subscription_status === "active"
        && ptSessionsLeft(member) > 0
        && !ptExpired,
    );
    return { gym, pt, ptSessionsLeft: ptSessionsLeft(member), ptExpired };
}

module.exports = { CHECK_IN_TYPES, COACH_ROLES, normalizeCheckInType, ptSessionsLeft, checkInOptions };
