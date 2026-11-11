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

module.exports = {
    findActiveSubscription,
    onOrAfterCalendarDay,
    validateNoOverlappingSubscription,
};
