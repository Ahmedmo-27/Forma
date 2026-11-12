const { monthKey, subscriptionSalePrice } = require("../utils/revenueUtils");

const GRACE_DAYS = 7;
const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_ENTRY_SOURCE = "data entry";

function parseDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function startOfMonth(date) {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfWeekMonday(date) {
    const d = startOfDay(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
}

function dayKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftMonthKey(key, offset) {
    const [year, month] = key.split("-").map(Number);
    return monthKey(new Date(year, month - 1 + offset, 1));
}

function lastMonthKeys(count, now) {
    const keys = [];
    const cursor = startOfMonth(now);
    for (let i = count - 1; i >= 0; i -= 1) {
        keys.push(monthKey(new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)));
    }
    return keys;
}

function priorMonthEnd(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 0, 23, 59, 59, 999);
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function formatPercent(rate) {
    return `${((Number(rate) || 0) * 100).toFixed(1)}%`;
}

function formatCurrency(amount, currency = "EGP") {
    const rounded = Math.round(Number(amount) || 0);
    const text = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${currency} ${text}`;
}

const formatEgp = (amount) => formatCurrency(amount, "EGP");

function serverTimezone(timeZone) {
    return timeZone || "Africa/Cairo";
}

function subscriptionIntervals(member) {
    return (member.subscriptions || [])
        .map((sub) => {
            const start = parseDate(sub.startDate);
            const end = parseDate(sub.endDate);
            if (!start || !end || end < start) return null;
            return { start, end };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
}

/**
 * An open freeze has not yet been written onto subscription endDate.
 * Keep the member covered through that freeze end when it outlasts the subscription.
 */
function applyOpenFreeze(member, intervals, now) {
    if (!intervals.length) return intervals;
    let freezeEnd = null;
    for (const freeze of member.freeze || []) {
        if (freeze.endedBy) continue;
        const end = parseDate(freeze.endDate);
        if (!end || end <= now) continue;
        if (!freezeEnd || end > freezeEnd) freezeEnd = end;
    }
    if (!freezeEnd) return intervals;
    const last = intervals[intervals.length - 1];
    if (freezeEnd > last.end) last.end = freezeEnd;
    return intervals;
}

function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged = [{ start: sorted[0].start, end: sorted[0].end }];
    for (let i = 1; i < sorted.length; i += 1) {
        const last = merged[merged.length - 1];
        if (sorted[i].start <= last.end) {
            if (sorted[i].end > last.end) last.end = sorted[i].end;
        } else {
            merged.push({ start: sorted[i].start, end: sorted[i].end });
        }
    }
    return merged;
}

function memberCoverage(member, now) {
    const intervals = applyOpenFreeze(member, subscriptionIntervals(member), now);
    const merged = mergeIntervals(intervals);
    const events = [];
    for (let i = 0; i < merged.length; i += 1) {
        const end = merged[i].end;
        const next = merged[i + 1];
        if (next) {
            if (next.start - end > GRACE_MS) {
                events.push({ type: "churn", at: end });
                events.push({ type: "reactivation", at: next.start });
            }
        } else if (now - end > GRACE_MS) {
            events.push({ type: "churn", at: end });
        }
    }
    return { merged, events };
}

function isCovered(merged, date) {
    const time = new Date(date).getTime();
    return merged.some((interval) => interval.start.getTime() <= time && time <= interval.end.getTime());
}

function currentCoverageEnd(merged, now) {
    const time = now.getTime();
    const current = merged.find((interval) => interval.start.getTime() <= time && time <= interval.end.getTime());
    return current ? current.end : null;
}

function firstSubscriptionStart(member) {
    const intervals = subscriptionIntervals(member);
    return intervals.length ? intervals[0].start : null;
}

function isRenewed(member) {
    const subs = member.subscriptions || [];
    if (subs.length >= 2) return true;
    return subs.some((sub) => sub.isRenewal);
}

function buildChurn(members, now = new Date(), months = 12) {
    const keys = lastMonthKeys(months, now);
    const analyzed = (members || []).map((member) => ({
        member,
        coverage: memberCoverage(member, now),
    }));

    const series = keys.map((key) => {
        const priorEnd = priorMonthEnd(key);
        let coveredAtStart = 0;
        let churned = 0;
        let reactivated = 0;

        for (const row of analyzed) {
            const covered = isCovered(row.coverage.merged, priorEnd);
            if (covered) coveredAtStart += 1;
            for (const event of row.coverage.events) {
                if (monthKey(event.at) !== key) continue;
                if (event.type === "churn" && covered) churned += 1;
                if (event.type === "reactivation") reactivated += 1;
            }
        }

        return {
            month: key,
            coveredAtStart,
            churned,
            churnRate: coveredAtStart ? churned / coveredAtStart : 0,
            reactivated,
        };
    });

    const horizon = now.getTime() + 30 * DAY_MS;
    const atRisk = [];
    for (const row of analyzed) {
        const end = currentCoverageEnd(row.coverage.merged, now);
        if (!end) continue;
        const endTime = end.getTime();
        if (endTime < now.getTime() || endTime > horizon) continue;
        atRisk.push({
            id: row.member._id ? String(row.member._id) : null,
            name: row.member.name || "Member",
            systemId: row.member.systemId ?? null,
            memberId: row.member.memberId ?? null,
            coverageEnd: end.toISOString(),
            daysRemaining: Math.max(0, Math.ceil((endTime - now.getTime()) / DAY_MS)),
        });
    }
    atRisk.sort((a, b) => a.daysRemaining - b.daysRemaining || a.name.localeCompare(b.name));

    return {
        graceDays: GRACE_DAYS,
        months: series,
        atRisk: atRisk.slice(0, 100),
        atRiskCount: atRisk.length,
    };
}

function buildForecast(members, now = new Date(), { currency = "EGP" } = {}) {
    const keys = lastMonthKeys(24, now);
    const map = {};
    for (const key of keys) {
        map[key] = { month: key, revenue: 0, salesCount: 0 };
    }

    for (const member of members || []) {
        for (const sub of member.subscriptions || []) {
            const saleDate = parseDate(sub.startDate);
            if (!saleDate) continue;
            const key = monthKey(saleDate);
            if (!map[key]) continue;
            const price = subscriptionSalePrice(sub);
            if (!price) continue;
            map[key].revenue += price;
            map[key].salesCount += 1;
        }
    }

    const currentKey = monthKey(now);
    const completeKeys = keys.filter((key) => key < currentKey);
    const lastThree = completeKeys.slice(-3);
    const trailingAverage = lastThree.length
        ? lastThree.reduce((sum, key) => sum + map[key].revenue, 0) / lastThree.length
        : 0;

    const actuals = keys.slice(-12).map((key) => {
        const priorKey = shiftMonthKey(key, -12);
        return {
            month: key,
            revenue: roundMoney(map[key].revenue),
            salesCount: map[key].salesCount,
            partial: key === currentKey,
            priorYearRevenue: map[priorKey] ? roundMoney(map[priorKey].revenue) : null,
        };
    });

    const forecast = [1, 2, 3].map((offset) => ({
        month: shiftMonthKey(currentKey, offset),
        revenue: roundMoney(trailingAverage),
    }));

    return {
        currency,
        method: "trailing_3_month_average",
        currentMonth: currentKey,
        trailingAverage: roundMoney(trailingAverage),
        actuals,
        forecast,
    };
}

function buildCohorts(members, now = new Date(), months = 12) {
    const cohortKeys = lastMonthKeys(months, now);
    const currentKey = monthKey(now);
    const groups = new Map(cohortKeys.map((key) => [key, []]));

    for (const member of members || []) {
        const first = firstSubscriptionStart(member);
        if (!first) continue;
        const key = monthKey(first);
        if (!groups.has(key)) continue;
        groups.get(key).push(memberCoverage(member, now));
    }

    const cohorts = cohortKeys.map((key) => {
        const group = groups.get(key);
        const size = group.length;
        const retention = [];
        for (let offset = 0; offset < 12; offset += 1) {
            const targetKey = shiftMonthKey(key, offset);
            if (targetKey > currentKey || size === 0) {
                retention.push(null);
                continue;
            }
            const [year, month] = targetKey.split("-").map(Number);
            const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
            const covered = group.filter((coverage) => isCovered(coverage.merged, monthEnd)).length;
            retention.push(covered / size);
        }
        return { cohort: key, size, retention };
    });

    return { months, cohorts };
}

function buildFunnel(members, { from, to, includeImported = false, currency = "EGP" } = {}) {
    const start = startOfDay(from);
    const end = endOfDay(to);
    const list = members || [];

    const leads = list.filter((member) => {
        const created = parseDate(member.createdAt);
        if (!created || created < start || created > end) return false;
        if (!includeImported && member.source === DATA_ENTRY_SOURCE) return false;
        return true;
    });

    const created = leads.length;
    const convertedList = leads.filter((member) => (member.subscriptions || []).length > 0);
    const converted = convertedList.length;
    const stillGuest = Math.max(0, created - converted);
    const renewed = convertedList.filter(isRenewed).length;

    const stages = [
        { key: "created", label: "Created", count: created },
        { key: "stillGuest", label: "Still guest", count: stillGuest },
        { key: "converted", label: "Converted", count: converted },
        { key: "renewed", label: "Renewed", count: renewed },
    ];

    const dropOff = [
        {
            from: "created",
            to: "converted",
            lost: Math.max(0, created - converted),
            rate: created ? (created - converted) / created : 0,
        },
        {
            from: "converted",
            to: "renewed",
            lost: Math.max(0, converted - renewed),
            rate: converted ? (converted - renewed) / converted : 0,
        },
    ];

    const bySource = new Map();
    const rowFor = (source) => {
        const key = source || "Unknown";
        if (!bySource.has(key)) {
            bySource.set(key, { source: key, leads: 0, converted: 0, conversionRate: 0, revenue: 0 });
        }
        return bySource.get(key);
    };

    for (const member of leads) {
        const row = rowFor(member.source);
        row.leads += 1;
        if ((member.subscriptions || []).length > 0) row.converted += 1;
    }

    for (const member of list) {
        for (const sub of member.subscriptions || []) {
            const saleDate = parseDate(sub.startDate);
            if (!saleDate || saleDate < start || saleDate > end) continue;
            const price = subscriptionSalePrice(sub);
            if (!price) continue;
            rowFor(member.source).revenue += price;
        }
    }

    const sourceRows = [...bySource.values()]
        .map((row) => ({
            ...row,
            conversionRate: row.leads ? row.converted / row.leads : 0,
            revenue: roundMoney(row.revenue),
        }))
        .filter((row) => row.leads || row.converted || row.revenue)
        .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads || a.source.localeCompare(b.source));

    return {
        from: dayKey(start),
        to: dayKey(end),
        includeImported: Boolean(includeImported),
        currency,
        stages,
        dropOff,
        conversionRate: created ? converted / created : 0,
        bySource: sourceRows,
    };
}

function bucketAttendance(checkIns, { from, to } = {}) {
    const start = startOfDay(from);
    const end = endOfDay(to);
    const cells = new Map();
    const days = new Map();

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        days.set(dayKey(cursor), 0);
    }

    let totalCheckIns = 0;
    for (const raw of checkIns || []) {
        const at = parseDate(raw);
        if (!at || at < start || at > end) continue;
        const cellKey = `${at.getDay()}-${at.getHours()}`;
        cells.set(cellKey, (cells.get(cellKey) || 0) + 1);
        const key = dayKey(at);
        if (days.has(key)) days.set(key, (days.get(key) || 0) + 1);
        totalCheckIns += 1;
    }

    const grid = [];
    for (let dow = 0; dow < 7; dow += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            grid.push({ dow, hour, count: cells.get(`${dow}-${hour}`) || 0 });
        }
    }

    return {
        from: dayKey(start),
        to: dayKey(end),
        totalCheckIns,
        grid,
        days: [...days.entries()].map(([date, count]) => ({ date, count })),
    };
}

function buildNarrative(summary, { currency } = {}) {
    const curr = currency || summary?.currency || "EGP";
    let churnSentence;
    if (summary.previousChurnRate == null) {
        churnSentence = `Churn this month is ${formatPercent(summary.churnRate)}.`;
    } else {
        const delta = summary.churnRate - summary.previousChurnRate;
        const direction = Math.abs(delta) < 0.0001 ? "unchanged from" : delta > 0 ? "up from" : "down from";
        churnSentence = `Churn this month is ${formatPercent(summary.churnRate)}, ${direction} ${formatPercent(summary.previousChurnRate)} last month.`;
    }
    const revenueSentence = `Revenue collected this month is ${formatCurrency(summary.revenueThisMonth, curr)}, against a three-month average of ${formatCurrency(summary.trailingAverage, curr)}. Next month is forecast at ${formatCurrency(summary.forecastNextMonth, curr)}.`;
    return `${churnSentence} ${revenueSentence}`;
}

function buildExecutive(members, checkInsThisWeek, now = new Date(), { currency = "EGP" } = {}) {
    const churn = buildChurn(members, now, 2);
    const forecast = buildForecast(members, now, { currency });
    const funnel = buildFunnel(members, {
        from: startOfMonth(now),
        to: endOfDay(now),
        includeImported: false,
        currency,
    });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfDay(now);
    const current = churn.months[churn.months.length - 1] || null;
    const previous = churn.months.length > 1 ? churn.months[churn.months.length - 2] : null;
    const revenueThisMonth = forecast.actuals.find((row) => row.month === forecast.currentMonth)?.revenue ?? 0;

    let newMembersThisMonth = 0;
    let activeMembers = 0;
    for (const member of members || []) {
        if (member.status === "active") activeMembers += 1;
        const first = firstSubscriptionStart(member);
        if (first && first >= monthStart && first <= monthEnd) newMembersThisMonth += 1;
    }

    const summary = {
        currency,
        asOf: now.toISOString(),
        scope: "whole_gym",
        activeMembers,
        newMembersThisMonth,
        churnRate: current?.churnRate ?? 0,
        previousChurnRate: previous?.churnRate ?? null,
        revenueThisMonth,
        trailingAverage: forecast.trailingAverage,
        forecastNextMonth: forecast.forecast[0]?.revenue ?? 0,
        leadConversionRate: funnel.conversionRate,
        checkInsThisWeek: checkInsThisWeek || 0,
        expiringIn30Days: churn.atRiskCount,
        narrative: "",
    };
    summary.narrative = buildNarrative(summary, { currency });
    return summary;
}

function memberModel() {
    return require("../models/Member");
}

const MEMBER_FIELDS = "name systemId memberId status source createdAt isMember subscriptions freeze";

async function loadMembers(locationFilter = {}) {
    return memberModel().find(locationFilter || {}).select(MEMBER_FIELDS).lean();
}

async function countCheckIns(from, to, locationFilter = {}) {
    const pipeline = [];
    if (locationFilter && Object.keys(locationFilter).length) {
        pipeline.push({ $match: locationFilter });
    }
    pipeline.push(
        {
            $project: {
                checkIns: {
                    $filter: {
                        input: { $ifNull: ["$userlog", []] },
                        as: "log",
                        cond: {
                            $and: [
                                { $eq: ["$$log.type", "check-in"] },
                                { $gte: ["$$log.createdAt", from] },
                                { $lte: ["$$log.createdAt", to] },
                            ],
                        },
                    },
                },
            },
        },
        { $project: { n: { $size: "$checkIns" } } },
        { $group: { _id: null, total: { $sum: "$n" } } },
    );
    const rows = await memberModel().aggregate(pipeline);
    return rows[0]?.total || 0;
}

async function loadAttendanceBuckets(from, to, timeZone, locationFilter = {}) {
    const timezone = serverTimezone(timeZone);
    const pipeline = [];
    if (locationFilter && Object.keys(locationFilter).length) {
        pipeline.push({ $match: locationFilter });
    }
    pipeline.push(
        {
            $project: {
                checkIns: {
                    $filter: {
                        input: { $ifNull: ["$userlog", []] },
                        as: "log",
                        cond: {
                            $and: [
                                { $eq: ["$$log.type", "check-in"] },
                                { $gte: ["$$log.createdAt", from] },
                                { $lte: ["$$log.createdAt", to] },
                            ],
                        },
                    },
                },
            },
        },
        { $unwind: "$checkIns" },
        {
            $facet: {
                cells: [
                    {
                        $group: {
                            _id: {
                                dow: {
                                    $subtract: [
                                        { $dayOfWeek: { date: "$checkIns.createdAt", timezone } },
                                        1,
                                    ],
                                },
                                hour: { $hour: { date: "$checkIns.createdAt", timezone } },
                            },
                            count: { $sum: 1 },
                        },
                    },
                ],
                days: [
                    {
                        $group: {
                            _id: {
                                $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: "$checkIns.createdAt",
                                    timezone,
                                },
                            },
                            count: { $sum: 1 },
                        },
                    },
                ],
            },
        },
    );
    const rows = await memberModel().aggregate(pipeline);
    return rows[0] || { cells: [], days: [] };
}

function attendanceFromBuckets(buckets, from, to, weeks, timeZone) {
    const cellCounts = new Map();
    for (const row of buckets.cells || []) {
        cellCounts.set(`${row._id.dow}-${row._id.hour}`, row.count);
    }
    const dayCounts = new Map();
    for (const row of buckets.days || []) {
        dayCounts.set(row._id, row.count);
    }
    const base = bucketAttendance([], { from, to });
    const grid = base.grid.map((cell) => ({
        ...cell,
        count: cellCounts.get(`${cell.dow}-${cell.hour}`) || 0,
    }));
    const days = base.days.map((day) => ({
        date: day.date,
        count: dayCounts.get(day.date) || 0,
    }));
    const totalCheckIns = [...cellCounts.values()].reduce((sum, count) => sum + count, 0);
    return {
        weeks,
        from: base.from,
        to: base.to,
        timezone: serverTimezone(timeZone),
        totalCheckIns,
        grid,
        days,
    };
}

async function getChurn({ months = 12, locationFilter = {} } = {}) {
    const members = await loadMembers(locationFilter);
    return buildChurn(members, new Date(), months);
}

async function getForecast({ currency = "EGP", locationFilter = {} } = {}) {
    const members = await loadMembers(locationFilter);
    return buildForecast(members, new Date(), { currency });
}

async function getCohorts({ months = 12, locationFilter = {} } = {}) {
    const members = await loadMembers(locationFilter);
    return buildCohorts(members, new Date(), months);
}

async function getAttendance({ weeks = 8, timeZone, locationFilter = {} } = {}) {
    const now = new Date();
    const from = startOfDay(now);
    from.setDate(from.getDate() - weeks * 7);
    const to = endOfDay(now);
    const buckets = await loadAttendanceBuckets(from, to, timeZone, locationFilter);
    return attendanceFromBuckets(buckets, from, to, weeks, timeZone);
}

async function getFunnel({ from, to, includeImported = false, currency = "EGP", locationFilter = {} } = {}) {
    const now = new Date();
    const members = await loadMembers(locationFilter);
    return buildFunnel(members, {
        from: from || startOfMonth(now),
        to: to || endOfDay(now),
        includeImported,
        currency,
    });
}

async function getExecutive({ currency = "EGP", locationFilter = {} } = {}) {
    const now = new Date();
    const members = await loadMembers(locationFilter);
    const checkInsThisWeek = await countCheckIns(startOfWeekMonday(now), endOfDay(now), locationFilter);
    return buildExecutive(members, checkInsThisWeek, now, { currency });
}

module.exports = {
    GRACE_DAYS,
    formatCurrency,
    formatEgp,
    buildChurn,
    buildForecast,
    buildCohorts,
    buildFunnel,
    bucketAttendance,
    buildNarrative,
    buildExecutive,
    getChurn,
    getForecast,
    getCohorts,
    getAttendance,
    getFunnel,
    getExecutive,
};
