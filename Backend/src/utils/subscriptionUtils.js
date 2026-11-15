/**
 * Find a subscription that is currently active (start <= now < end).
 */
function findActiveSubscription(subscriptions, now = new Date()) {
    return (subscriptions || []).find((sub) => {
        if (!sub?.startDate || !sub?.endDate) return false;
        if (sub.refunded || sub.cancelled || sub.subscriptionStatus === "cancelled") return false;
        const start = new Date(sub.startDate);
        const end = new Date(sub.endDate);
        return start <= now && end > now;
    });
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

function isClosedSubscription(sub) {
    if (!sub) return true;
    return Boolean(sub.refunded || sub.cancelled || sub.subscriptionStatus === "cancelled");
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

    const list = subscriptions || [];
    const currentSub = list.length ? list[list.length - 1] : null;
    const currentEndDate = !isClosedSubscription(currentSub) && currentSub?.endDate
        ? new Date(currentSub.endDate)
        : null;

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
    onOrAfterCalendarDay,
    validateNoOverlappingSubscription,
    isClosedSubscription,
    resolveNextPackageStart,
    closeRefundedSubscription,
};
