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

/**
 * Package that should drive access limits and the profile.
 * Prefer the row that covers now. Otherwise the latest row that was not refunded or cancelled.
 */
function currentPackageSubscription(subscriptions, now = new Date()) {
    return findActiveSubscription(subscriptions, now) || latestOpenSubscription(subscriptions);
}

/** Latest subscription that is still a real package. */
function latestOpenSubscription(subscriptions) {
    const list = subscriptions || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (!isClosedSubscription(list[i])) return list[i];
    }
    return null;
}

/**
 * Find the latest subscription that is currently active (start <= now < end).
 * Refunded and cancelled rows are skipped, even when their end date is still in the future.
 */
function findActiveSubscription(subscriptions, now = new Date()) {
    const list = subscriptions || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const sub = list[i];
        if (!sub?.startDate || !sub?.endDate || isClosedSubscription(sub)) continue;
        const start = new Date(sub.startDate);
        const end = new Date(sub.endDate);
        if (start <= now && end > now) return sub;
    }
    return null;
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
 * Reject when a proposed package start overlaps an existing active subscription.
 */
function validateNoOverlappingSubscription(subscriptions, proposedStart, now = new Date()) {
    const activeSub = findActiveSubscription(subscriptions, now);
    if (!activeSub) return null;

    const activeEnd = new Date(activeSub.endDate);
    if (!onOrAfterCalendarDay(proposedStart, activeEnd)) {
        return `Member has an active subscription until ${activeEnd.toISOString().slice(0, 10)}. New package must start on or after that date.`;
    }

    return null;
}

/**
 * Choose the start of the next package.
 * A refunded or cancelled subscription does not hold the calendar.
 * An upgrade starts now and leaves the previous row untouched.
 */
function resolveNextPackageStart({ subscriptions, startDate, upgrade = false, now = new Date() } = {}) {
    if (upgrade) {
        return { start: new Date(now), error: null };
    }

    const currentSub = latestOpenSubscription(subscriptions);
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
    currentPackageSubscription,
    onOrAfterCalendarDay,
    validateNoOverlappingSubscription,
    isClosedSubscription,
    isForfeitedCancellation,
    isTransferredAway,
    latestOpenSubscription,
    resolveNextPackageStart,
    closeRefundedSubscription,
};
