/**
 * Staff lock (manual) vs timed suspend. Both set isBlocked so login/API reject access.
 */

function isStaffRestricted(user) {
    return Boolean(user?.isBlocked);
}

function isTimedSuspension(user) {
    return user?.restrictionType === "suspend";
}

function suspensionExpired(user, now = new Date()) {
    if (!isTimedSuspension(user) || !user.suspendedUntil) return false;
    const until = new Date(user.suspendedUntil);
    return !Number.isNaN(until.getTime()) && until <= now;
}

function clearRestrictionFields(user) {
    user.isBlocked = false;
    user.restrictionType = null;
    user.suspendedUntil = null;
    user.blockedReason = null;
    user.blockedBy = null;
    user.blockedAt = null;
}

async function maybeClearExpiredSuspension(user, { save = true } = {}) {
    if (!user || !suspensionExpired(user)) return false;
    clearRestrictionFields(user);
    if (save && typeof user.save === "function") {
        await user.save();
    }
    return true;
}

function loginDeniedPayload(user) {
    if (!isStaffRestricted(user)) return null;
    if (isTimedSuspension(user)) {
        const until = user.suspendedUntil
            ? new Date(user.suspendedUntil).toISOString().slice(0, 10)
            : null;
        return {
            code: "STAFF_SUSPENDED",
            status: 403,
            message: until
                ? `Your account is suspended until ${until}. Contact your gym owner.`
                : "Your account is suspended. Contact your gym owner.",
            details: { suspendedUntil: user.suspendedUntil || null, reason: user.blockedReason || null },
        };
    }
    return {
        code: "STAFF_LOCKED",
        status: 403,
        message: "Your account is locked. Contact your gym owner.",
        details: { reason: user.blockedReason || null },
    };
}

function restrictionDeniedMessage(user) {
    const payload = loginDeniedPayload(user);
    return payload?.message || null;
}

/**
 * Who may lock/suspend/unlock whom.
 * Owner: any staff except themselves.
 * GM: any staff except Owner, other GMs, and themselves.
 */
function staffRestrictionDenied(actorRole, actorId, target) {
    if (!target) return "User not found";
    const targetId = target._id?.toString?.() || String(target._id || target.id || "");
    if (actorId && targetId && String(actorId) === String(targetId)) {
        return "You cannot restrict your own account";
    }
    if (actorRole === "Owner") return null;
    if (actorRole === "General Manager") {
        if (target.role === "Owner" || target.role === "General Manager") {
            return "You cannot restrict this user";
        }
        return null;
    }
    return "You cannot restrict this user";
}

module.exports = {
    isStaffRestricted,
    isTimedSuspension,
    suspensionExpired,
    clearRestrictionFields,
    maybeClearExpiredSuspension,
    loginDeniedPayload,
    restrictionDeniedMessage,
    staffRestrictionDenied,
};
