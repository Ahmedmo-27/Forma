/**
 * Member lock (manual) vs timed suspend. Both set isBlocked for access checks.
 */

function isMemberRestricted(member) {
    return Boolean(member?.isBlocked);
}

function isTimedSuspension(member) {
    return member?.restrictionType === "suspend";
}

function suspensionExpired(member, now = new Date()) {
    if (!isTimedSuspension(member) || !member.suspendedUntil) return false;
    const until = new Date(member.suspendedUntil);
    return !Number.isNaN(until.getTime()) && until <= now;
}

function clearRestrictionFields(member) {
    member.isBlocked = false;
    member.restrictionType = null;
    member.suspendedUntil = null;
    member.blockedReason = null;
    member.blockedBy = null;
    member.blockedAt = null;
}

async function maybeClearExpiredSuspension(member, { save = true } = {}) {
    if (!member || !suspensionExpired(member)) return false;
    clearRestrictionFields(member);
    if (save && typeof member.save === "function") {
        await member.save();
    }
    return true;
}

function checkInDeniedMessage(member) {
    if (!isMemberRestricted(member)) return null;
    if (isTimedSuspension(member)) {
        return "Cannot check in — member is suspended";
    }
    return "Cannot check in — member is blocked";
}

module.exports = {
    isMemberRestricted,
    isTimedSuspension,
    suspensionExpired,
    clearRestrictionFields,
    maybeClearExpiredSuspension,
    checkInDeniedMessage,
};