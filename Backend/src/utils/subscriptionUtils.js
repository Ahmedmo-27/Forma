/**
 * A refund, of any amount, voids the whole package. Cancelled rows are void too.
 * Those rows do not grant access and do not hold the calendar.
 */
function isClosedSubscription(sub) {
    if (!sub) return true;
    if (Number(sub.refundAmount) > 0) return true;
    return Boolean(sub.refunded || sub.cancelled || sub.subscriptionStatus === "cancelled");
}

/** Cancelled for cause: the sale stays, and the member is not entitled to a refund. */
function isForfeitedCancellation(sub) {
    if (!sub) return false;
    if (sub.refunded || Number(sub.refundAmount) > 0) return false;
    return Boolean(String(sub.cancelReason || "").trim());
}

/** The package was given to someone else. The original member is not refunded. */
function isTransferredAway(sub) {
    return Boolean(sub?.transferredTo);
}

/** Activity category frozen on the sale, falling back to a populated package or gym. */
function subscriptionActivityType(sub) {
    if (!sub) return "gym";
    const fromSnapshot = sub.packageSnapshot?.activityType;
    if (fromSnapshot) return fromSnapshot;
    const pkg = sub.package;
    if (pkg && typeof pkg === "object" && pkg.activityType) return pkg.activityType;
    return "gym";
}

function matchesActivityType(sub, activityType) {
    if (activityType == null || activityType === "") return true;
    return subscriptionActivityType(sub) === activityType;
}

/**
 * Package that should drive access limits and the profile.
 * Prefer the row that covers now. Otherwise the latest row that was not refunded or cancelled.
 */
function currentPackageSubscription(subscriptions, now = new Date(), activityType = null) {
    return findActiveSubscription(subscriptions, now, activityType)
        || latestOpenSubscription(subscriptions, activityType);
}

/** Latest subscription that is still a real package (optionally within one activity category). */
function latestOpenSubscription(subscriptions, activityType = null) {
    const list = subscriptions || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (!isClosedSubscription(list[i])) {
            if (!matchesActivityType(list[i], activityType)) continue;
            return list[i];
        }
    }
    return null;
}

/**
 * Find the latest subscription that is currently active (start <= now < end).
 * Refunded and cancelled rows are skipped, even when their end date is still in the future.
 * When activityType is set, only that category is considered — members may hold one active
 * package per category at a time.
 */
function findActiveSubscription(subscriptions, now = new Date(), activityType = null) {
    const list = subscriptions || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const sub = list[i];
        if (!sub?.startDate || !sub?.endDate || isClosedSubscription(sub)) continue;
        if (!matchesActivityType(sub, activityType)) continue;
        const start = new Date(sub.startDate);
        const end = new Date(sub.endDate);
        if (start <= now && end > now) return sub;
    }
    return null;
}

/** Every subscription that currently covers now (one per category is expected). */
function findActiveSubscriptions(subscriptions, now = new Date()) {
    const list = subscriptions || [];
    const active = [];
    for (let i = 0; i < list.length; i += 1) {
        const sub = list[i];
        if (!sub?.startDate || !sub?.endDate || isClosedSubscription(sub)) continue;
        const start = new Date(sub.startDate);
        const end = new Date(sub.endDate);
        if (start <= now && end > now) active.push(sub);
    }
    return active;
}

/**
 * Compare calendar dates (ignore time-of-day).
 */
function onOrAfterCalendarDay(candidate, minimum) {
    const day = new Date(candidate);
    day.setHours(0, 0, 0, 0);
    const minDay = new Date(minimum);
    minDay.setHours(0, 0, 0, 0);
    return day >= minDay;
}

/**
 * Reject when a proposed package start overlaps an existing active subscription
 * in the same activity category. Different categories may run concurrently.
 */
function validateNoOverlappingSubscription(subscriptions, proposedStart, now = new Date(), activityType = null) {
    const activeSub = findActiveSubscription(subscriptions, now, activityType);
    if (!activeSub) return null;

    const activeEnd = new Date(activeSub.endDate);
    if (!onOrAfterCalendarDay(proposedStart, activeEnd)) {
        const category = activityType || subscriptionActivityType(activeSub);
        return `Member has an active ${category} subscription until ${activeEnd.toISOString().slice(0, 10)}. New package must start on or after that date.`;
    }

    return null;
}

/**
 * Choose the start of the next package within the same activity category.
 * A refunded or cancelled subscription does not hold the calendar.
 * An upgrade starts now and leaves the previous row untouched.
 * Active packages in other categories do not block or shift this start.
 */
function resolveNextPackageStart({ subscriptions, startDate, upgrade = false, now = new Date(), activityType = null } = {}) {
    if (upgrade) {
        return { start: new Date(now), error: null };
    }

    const currentSub = latestOpenSubscription(subscriptions, activityType);
    const currentEndDate = currentSub?.endDate ? new Date(currentSub.endDate) : null;

    if (startDate) {
        const start = new Date(startDate);
        if (currentEndDate && currentEndDate > now) {
            const startDay = new Date(start);
            startDay.setHours(0, 0, 0, 0);
            const endDay = new Date(currentEndDate);
            endDay.setHours(0, 0, 0, 0);
            if (startDay < endDay) {
                return {
                    start: null,
                    error: `Start date must be on or after the current package end date (${currentEndDate.toISOString().slice(0, 10)})`,
                };
            }
        }
        return { start, error: null };
    }

    const start = (currentEndDate && currentEndDate > now) ? new Date(currentEndDate) : new Date(now);
    return { start, error: null };
}

/** A refund closes a still-open term at the refund time. Price fields stay as they are. */
function closeRefundedSubscription(subscription, refundedAt = new Date()) {
    if (!subscription?.endDate) return subscription;
    if (new Date(subscription.endDate) > refundedAt) {
        subscription.endDate = refundedAt;
    }
    return subscription;
}

module.exports = {
    findActiveSubscription,
    findActiveSubscriptions,
    currentPackageSubscription,
    onOrAfterCalendarDay,
    validateNoOverlappingSubscription,
    isClosedSubscription,
    isForfeitedCancellation,
    isTransferredAway,
    latestOpenSubscription,
    resolveNextPackageStart,
    closeRefundedSubscription,
    subscriptionActivityType,
};
