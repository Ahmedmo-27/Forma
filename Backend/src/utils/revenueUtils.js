const {
    zonedParts,
    localDateKey,
    zonedMidnightUtc,
    addLocalDays,
    dayRange,
} = require("../services/bi/time");

const CAIRO_ZONE = "Africa/Cairo";

function monthKey(date, timeZone = CAIRO_ZONE) {
    if (!date) return "";
    try {
        const p = zonedParts(date, timeZone);
        return `${p.year}-${String(p.month).padStart(2, "0")}`;
    } catch {
        const d = new Date(date);
        if (isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
}

function dayKey(date = new Date(), timeZone = CAIRO_ZONE) {
    if (!date) return "";
    try {
        return localDateKey(date, timeZone);
    } catch {
        const d = new Date(date);
        if (isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
}

function isSameDay(date, ref = new Date(), timeZone = CAIRO_ZONE) {
    const dKey = dayKey(date, timeZone);
    const refKey = dayKey(ref, timeZone);
    return Boolean(dKey && refKey && dKey === refKey);
}

function buildMonthlyMap(monthsBack, now = new Date(), timeZone = CAIRO_ZONE) {
    let currentYear;
    let currentMonth;
    try {
        const p = zonedParts(now, timeZone);
        currentYear = p.year;
        currentMonth = p.month - 1;
    } catch {
        const d = new Date(now);
        currentYear = d.getFullYear();
        currentMonth = d.getMonth();
    }
    const monthlyMap = {};

    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        monthlyMap[key] = { month: key, revenue: 0, salesCount: 0 };
    }

    return monthlyMap;
}

function cairoDayBounds(dateFrom, dateTo, timeZone = CAIRO_ZONE) {
    const today = dayKey(new Date(), timeZone);
    const from = dateFrom || today;
    const to = dateTo || from;
    const start = zonedMidnightUtc(from, timeZone);
    const nextDay = zonedMidnightUtc(addLocalDays(to, 1), timeZone);
    const end = new Date(nextDay.getTime() - 1);
    return { start, end, from, to };
}

const { resolveSubscriptionPackage } = require("./packageSnapshot");

function getCurrentSubscription(member) {
    const subs = member.subscriptions;
    if (!subs?.length) return null;
    return subs[subs.length - 1];
}

function getCurrentPackage(member) {
    const sub = getCurrentSubscription(member);
    return resolveSubscriptionPackage(sub);
}

/**
 * Money collected for a subscription.
 * Always prefer pricePaid (payment record), then packageSnapshot.price.
 * Never use the live catalog package.price — catalog edits must not rewrite history.
 * Any refundAmount stored on the subscription is subtracted from the final price.
 */
function subscriptionSalePrice(sub) {
    if (!sub) return 0;
    let price = 0;
    if (sub.pricePaid != null && sub.pricePaid !== "") {
        price = Number(sub.pricePaid) || 0;
    } else if (sub.packageSnapshot?.price != null) {
        price = Number(sub.packageSnapshot.price) || 0;
    } else {
        // Legacy rows only: last resort when no payment snapshot exists
        const resolved = resolveSubscriptionPackage(sub);
        price = Number(resolved?.price) || 0;
    }
    const refund = Number(sub.refundAmount) || 0;
    return Math.max(0, price - refund);
}

function memberPrice(member) {
    const sub = getCurrentSubscription(member);
    return subscriptionSalePrice(sub);
}

/**
 * Aggregate total revenue from members' subscriptions using payment records.
 */
function aggregateSubscriptionRevenue(members = []) {
    let totalRevenue = 0;
    let salesCount = 0;

    for (const member of members) {
        for (const sub of member.subscriptions || []) {
            const price = subscriptionSalePrice(sub);
            if (!price) continue;
            totalRevenue += price;
            salesCount += 1;
        }
    }

    return { totalRevenue, salesCount };
}

/**
 * Incorrect revenue path that follows the live catalog price.
 * Used in tests to demonstrate the bug that packageSnapshot / pricePaid prevent.
 */
function aggregateRevenueFromLiveCatalogPrice(members = []) {
    let totalRevenue = 0;
    for (const member of members) {
        for (const sub of member.subscriptions || []) {
            const live = typeof sub.package === "object" ? sub.package : null;
            totalRevenue += Number(live?.price) || 0;
        }
    }
    return totalRevenue;
}

function attachCurrentPackage(memberObj) {
    const pkg = getCurrentPackage(memberObj);
    if (pkg) {
        memberObj.package = pkg;
    }
    return memberObj;
}

module.exports = {
    CAIRO_ZONE,
    monthKey,
    dayKey,
    isSameDay,
    buildMonthlyMap,
    cairoDayBounds,
    zonedMidnightUtc,
    addLocalDays,
    getCurrentSubscription,
    getCurrentPackage,
    subscriptionSalePrice,
    memberPrice,
    aggregateSubscriptionRevenue,
    aggregateRevenueFromLiveCatalogPrice,
    attachCurrentPackage,
};
