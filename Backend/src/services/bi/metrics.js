/**
 * One definition and one calculation path per gym metric.
 * Pure functions: no database, no tenant lookup, no random numbers.
 * Revenue is never grouped by staff. Sale credit is intentionally absent.
 */

const { toPiasters, netPiasters } = require("./money");
const {
    localDateKey,
    addLocalDays,
    weekdayOfKey,
    monthKeyOf,
    dayRange,
    inRange,
    zonedParts,
} = require("./time");

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_CAP = 200;
const MIN_RATE_SAMPLE = 20;
const DATA_ENTRY = "data entry";

const METRICS = {
    activeMembers: {
        feature: "members",
        unit: "count",
        name: "Active members",
        meaning: "People whose membership status is active at the end of the gym's local day.",
        formula: "Count of members with status active. Historical trend uses members whose subscription covered that day, because past status is not stored.",
        source: "Member.status and subscription coverage",
        grain: "day",
    },
    newJoins: {
        feature: "members",
        unit: "count",
        name: "New joins",
        meaning: "People whose first membership started on this day.",
        formula: "Count of members whose earliest subscription startDate falls on the local day.",
        source: "Member.subscriptions.startDate",
        grain: "day",
    },
    membershipSalesPiasters: {
        feature: "members",
        unit: "piasters",
        name: "Membership sales, net of refunds",
        meaning: "Membership money recorded on the day the membership starts, after refunds stored on that sale.",
        formula: "Sum of round(pricePaid × 100) − round(refundAmount × 100) for subscriptions whose startDate is that local day. Snapshot price is used only when pricePaid is missing. The live package catalog is ignored.",
        source: "Member.subscriptions.pricePaid, refundAmount, packageSnapshot",
        grain: "day",
    },
    checkIns: {
        feature: "checkin",
        unit: "count",
        name: "Check-ins",
        meaning: "Successful door check-ins. Denied attempts are not recorded.",
        formula: "Count of userlog entries with type check-in whose createdAt falls on the local day. The same member can appear more than once.",
        source: "Member.userlog",
        grain: "day",
    },
    distinctVisitors: {
        feature: "checkin",
        unit: "count",
        name: "Members who visited",
        meaning: "How many different members checked in at least once.",
        formula: "Distinct members with a check-in on the local day.",
        source: "Member.userlog",
        grain: "day",
    },
    ptSalesPiasters: {
        feature: "pt_tracking",
        unit: "piasters",
        name: "Personal training sales, net of refunds",
        meaning: "PT pack money, kept separate from membership sales.",
        formula: "Sum of net piasters on pt_subscriptions whose createdAt is the local day.",
        source: "Member.pt_subscriptions",
        grain: "day",
    },
    ptSessionsSold: {
        feature: "pt_tracking",
        unit: "count",
        name: "PT sessions sold",
        meaning: "Sessions on packs sold that day, plus free sessions included with a membership that started that day.",
        formula: "Sum of pt_subscriptions.sessions plus packageSnapshot.free_pt_sessions on memberships starting that day.",
        source: "Member.pt_subscriptions, packageSnapshot.free_pt_sessions",
        grain: "day",
    },
    ptSessionsUsed: {
        feature: "pt_tracking",
        unit: "count",
        name: "PT sessions used",
        meaning: "Sessions a coach logged.",
        formula: "Count of userlog entries with type pt-session that day.",
        source: "Member.userlog",
        grain: "day",
    },
    refundsPiasters: {
        feature: "accounting",
        unit: "piasters",
        name: "Refunds",
        meaning: "Refund amounts dated that day.",
        formula: "Sum of refund piasters whose refundedAt falls on the local day. Undated refunds are counted as a data-quality warning and are not assigned to a day.",
        source: "subscriptions.refundAmount, pt_subscriptions.refundAmount",
        grain: "day",
    },
    discountGapPiasters: {
        feature: "accounting",
        unit: "piasters",
        name: "Discount gap",
        meaning: "How much membership list price was given away versus what was charged.",
        formula: "For sales that day with a snapshot price: max(0, snapshot price piasters − pricePaid piasters).",
        source: "packageSnapshot.price, pricePaid",
        grain: "day",
    },
    renewalRate: {
        feature: "exec_analytics",
        unit: "rate",
        name: "Renewal rate",
        meaning: "Of memberships that finished, the share that started again within 7 days.",
        formula: "termsRenewed / termsEnded. A term still inside the 7-day grace window is excluded. Hidden when fewer than 20 terms have ended.",
        source: "subscription coverage intervals",
        grain: "period",
        minSample: MIN_RATE_SAMPLE,
    },
    churnEvents: {
        feature: "exec_analytics",
        unit: "count",
        name: "Churned memberships",
        meaning: "Memberships whose coverage ended and were not renewed within 7 days.",
        formula: "Same grace rule as the existing churn report: a gap longer than 7 days counts on the day coverage ended.",
        source: "subscription coverage intervals",
        grain: "day",
    },
    peopleAdded: {
        feature: "funnels",
        unit: "count",
        name: "People added",
        meaning: "New people entered in the gym, excluding spreadsheet imports.",
        formula: "Members whose createdAt is that local day and whose source is not data entry.",
        source: "Member.createdAt, Member.source",
        grain: "day",
    },
    peopleConverted: {
        feature: "funnels",
        unit: "count",
        name: "Converted",
        meaning: "People added who now have at least one membership. Recomputed when the snapshot is rebuilt.",
        formula: "peopleAdded who have a subscription. Grouped by current assigned sales rep for follow-up, not as sale credit.",
        source: "Member.createdAt, subscriptions, assignedSales",
        grain: "day",
    },
};

const TEMPLATES = [
    { key: "reduce_churn", metric: "churnRate", direction: "down", kind: "rate", window: 90, name: "Reduce churn" },
    { key: "grow_renewals", metric: "renewalRate", direction: "up", kind: "rate", window: 90, name: "Grow renewals" },
    { key: "fill_quiet_hours", metric: "quietHourShare", direction: "up", kind: "rate", window: 30, name: "Fill quiet hours" },
    { key: "raise_pt_utilization", metric: "ptUtilization", direction: "up", kind: "rate", window: 90, name: "Raise PT utilization" },
    { key: "speed_followup", metric: "medianHoursToNote", direction: "down", kind: "duration", window: 30, name: "Speed up follow-up" },
    { key: "raise_conversion", metric: "conversionRate", direction: "up", kind: "rate", window: 30, name: "Raise conversion" },
    { key: "cut_refunds", metric: "refundRate", direction: "down", kind: "rate", window: 90, name: "Cut refunds" },
    { key: "hit_sales_target", metric: "membershipSalesPiasters", direction: "up", kind: "money", window: 30, name: "Hit the sales target", linked: true },
];

function parseDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function subscriptionIntervals(member) {
    return (member.subscriptions || [])
        .map((sub) => {
            const start = parseDate(sub.startDate);
            const end = parseDate(sub.endDate);
            if (!start || !end || end < start) return null;
            return { start, end, sub };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
}

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
        if (sorted[i].start.getTime() <= last.end.getTime()) {
            if (sorted[i].end > last.end) last.end = sorted[i].end;
        } else {
            merged.push({ start: sorted[i].start, end: sorted[i].end });
        }
    }
    return merged;
}

function spells(member, now) {
    const intervals = subscriptionIntervals(member).map((row) => ({ start: row.start, end: row.end }));
    return mergeIntervals(applyOpenFreeze(member, intervals, now));
}

function isCovered(merged, date) {
    const time = new Date(date).getTime();
    return merged.some((interval) => interval.start.getTime() <= time && time <= interval.end.getTime());
}

function termEvents(merged, now) {
    const events = [];
    for (let i = 0; i < merged.length; i += 1) {
        const end = merged[i].end;
        if (end > now) continue;
        const next = merged[i + 1];
        if (next && next.start - end <= GRACE_MS) {
            events.push({ type: "renewed", at: end, renewal: next });
        } else if (!next && now - end <= GRACE_MS) {
            events.push({ type: "grace", at: end });
        } else {
            events.push({ type: "churned", at: end });
        }
    }
    return events;
}

function saleFigures(sub) {
    const refund = sub.refundAmount;
    if (sub.pricePaid != null && sub.pricePaid !== "") {
        const list = sub.packageSnapshot?.price != null ? toPiasters(sub.packageSnapshot.price) : null;
        return {
            net: netPiasters(sub.pricePaid, refund),
            paid: toPiasters(sub.pricePaid),
            list,
            missing: false,
        };
    }
    if (sub.packageSnapshot?.price != null) {
        const list = toPiasters(sub.packageSnapshot.price);
        return { net: netPiasters(sub.packageSnapshot.price, refund), paid: list, list, missing: false };
    }
    return { net: 0, paid: 0, list: null, missing: true };
}

function emptyBucket(dateKey, timeZone) {
    return {
        localDate: dateKey,
        weekday: weekdayOfKey(dateKey, timeZone),
        metrics: {
            newJoins: 0,
            coveredMembers: 0,
            statusActive: null,
            statusFrozen: null,
            statusExpired: null,
            statusGuest: null,
            membershipSalesPiasters: 0,
            salesCount: 0,
            refundsPiasters: 0,
            discountGapPiasters: 0,
            listPricePiasters: 0,
            exceptionSalesPiasters: 0,
            ptSalesPiasters: 0,
            ptSessionsSold: 0,
            freePtSessions: 0,
            ptSessionsUsed: 0,
            checkIns: 0,
            distinctVisitors: 0,
            termsEnded: 0,
            termsRenewed: 0,
            churnEvents: 0,
            peopleAdded: 0,
            peopleConverted: 0,
            guestCheckIns: 0,
        },
        hours: Array.from({ length: 24 }, () => 0),
        segments: { byActivity: {}, byPackage: {}, byAssignee: {}, byCoach: {} },
        samples: { renewalPiasters: [], firstNoteHours: [] },
        visitors: new Set(),
        quality: {
            missingPrice: 0,
            nullSnapshot: 0,
            undatedRefunds: 0,
            emptyRefundReason: 0,
            nullSource: 0,
            zeroPtPrice: 0,
        },
    };
}

function bump(map, key, field, amount) {
    if (!map[key]) map[key] = { key, salesPiasters: 0, salesCount: 0, added: 0, converted: 0, sessions: 0 };
    map[key][field] += amount;
}

function phoneKey(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 8 ? digits : "";
}

function publicMember(member, extra) {
    return {
        id: member._id ? String(member._id) : null,
        systemId: member.systemId ?? null,
        name: member.name || "Member",
        status: member.status || null,
        ...extra,
    };
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function memberHomeId(member) {
    if (!member?.locationId) return "";
    return String(member.locationId._id || member.locationId);
}

/**
 * Desk filter for attendance: stamped userlog.locationId wins;
 * legacy unstamped logs attribute to the member's home branch.
 * When deskLocationId is null/undefined, all logs match (tenant rollup).
 */
function logBelongsToDesk(log, member, deskLocationId) {
    if (!deskLocationId) return true;
    const desk = String(deskLocationId);
    const stamped = log.locationId != null ? String(log.locationId._id || log.locationId) : "";
    if (stamped) return stamped === desk;
    return memberHomeId(member) === desk;
}

function applyAttendanceLogs(member, buckets, timeZone, deskLocationId, firstInterval) {
    for (const log of member.userlog || []) {
        if (!log.createdAt) continue;
        if (!logBelongsToDesk(log, member, deskLocationId)) continue;
        const keyDate = localDateKey(log.createdAt, timeZone);
        const bucket = buckets.get(keyDate);
        if (!bucket) continue;
        if (log.type === "check-in") {
            bucket.metrics.checkIns += 1;
            bucket.visitors.add(String(member._id || member.systemId || member.name));
            const hour = zonedParts(new Date(log.createdAt), timeZone).hour;
            bucket.hours[hour] += 1;
            if (!firstInterval || new Date(log.createdAt) < firstInterval.start) {
                bucket.metrics.guestCheckIns += 1;
            }
        } else if (log.type === "pt-session") {
            bucket.metrics.ptSessionsUsed += 1;
            const coach = log.createdBy ? String(log.createdBy._id || log.createdBy) : "unknown";
            bump(bucket.segments.byCoach, coach, "sessions", 1);
        }
    }
}

/**
 * Scan members once and fill one bucket per local date.
 * Lists (at-risk, expiring, PT) are attached only to focusDate.
 * deskLocationId: when set, only desk-matching check-in/PT logs count.
 * attendanceExtras: visitors (other home branches) whose desk logs still count.
 */
function computeDays({
    members,
    dateKeys,
    timeZone,
    now,
    focusDate,
    pending,
    targetsSumPiasters,
    deskLocationId = null,
    attendanceExtras = null,
}) {
    const keys = [...dateKeys].sort();
    const buckets = new Map(keys.map((key) => [key, emptyBucket(key, timeZone)]));
    const ranges = new Map(keys.map((key) => [key, dayRange(key, timeZone)]));
    const focus = focusDate && buckets.get(focusDate) ? focusDate : keys[keys.length - 1];
    const focusRange = ranges.get(focus);
    const focusEnd = focusRange.end;
    const phoneCounts = new Map();
    const lists = {
        expiring: [],
        atRisk: [],
        declining: [],
        dormant: [],
        ptExpiring: [],
        frozenDue: [],
    };
    let ptRemainingSessions = 0;
    let ptExpiringSessions = 0;
    let ptExpiringPiasters = 0;
    const desk = deskLocationId ? String(deskLocationId) : null;

    for (const member of members || []) {
        const key = phoneKey(member.phones);
        if (key) phoneCounts.set(key, (phoneCounts.get(key) || 0) + 1);

        const merged = spells(member, now);
        const first = subscriptionIntervals(member)[0];
        for (const keyDate of keys) {
            const endProbe = new Date(ranges.get(keyDate).end.getTime() - 1);
            if (isCovered(merged, endProbe)) buckets.get(keyDate).metrics.coveredMembers += 1;
        }

        if (member.status && focus) {
            const bucket = buckets.get(focus);
            if (member.status === "active") bucket.metrics.statusActive = (bucket.metrics.statusActive || 0) + 1;
            else if (member.status === "frozen") bucket.metrics.statusFrozen = (bucket.metrics.statusFrozen || 0) + 1;
            else if (member.status === "expired") bucket.metrics.statusExpired = (bucket.metrics.statusExpired || 0) + 1;
            else if (member.status === "guest") bucket.metrics.statusGuest = (bucket.metrics.statusGuest || 0) + 1;
        }

        if (first) {
            const joinKey = localDateKey(first.start, timeZone);
            if (buckets.has(joinKey)) buckets.get(joinKey).metrics.newJoins += 1;
        }

        for (const event of termEvents(merged, now)) {
            const keyDate = localDateKey(event.at, timeZone);
            const bucket = buckets.get(keyDate);
            if (!bucket) continue;
            if (event.type === "grace") continue;
            bucket.metrics.termsEnded += 1;
            if (event.type === "renewed") {
                bucket.metrics.termsRenewed += 1;
                const nextSub = (member.subscriptions || []).find((sub) => {
                    const start = parseDate(sub.startDate);
                    return start && Math.abs(start - event.renewal.start) < 1000;
                });
                if (nextSub) bucket.samples.renewalPiasters.push(saleFigures(nextSub).net);
            } else {
                bucket.metrics.churnEvents += 1;
            }
        }

        for (const sub of member.subscriptions || []) {
            const figures = saleFigures(sub);
            const startKey = sub.startDate ? localDateKey(sub.startDate, timeZone) : null;
            if (startKey && buckets.has(startKey)) {
                const bucket = buckets.get(startKey);
                if (figures.missing) bucket.quality.missingPrice += 1;
                if (!sub.packageSnapshot) bucket.quality.nullSnapshot += 1;
                bucket.metrics.membershipSalesPiasters += figures.net;
                bucket.metrics.salesCount += 1;
                if (figures.list != null) {
                    bucket.metrics.listPricePiasters += figures.list;
                    bucket.metrics.discountGapPiasters += Math.max(0, figures.list - figures.paid);
                }
                if (sub.packageSnapshot?.hasException) bucket.metrics.exceptionSalesPiasters += figures.net;
                const activity = sub.packageSnapshot?.activityType || "unknown";
                const pack = sub.packageSnapshot?.name
                    ? `${sub.packageSnapshot.name} · ${sub.packageSnapshot.duration || ""}`.trim()
                    : "Unknown package";
                bump(bucket.segments.byActivity, activity, "salesPiasters", figures.net);
                bump(bucket.segments.byActivity, activity, "salesCount", 1);
                bump(bucket.segments.byPackage, pack, "salesPiasters", figures.net);
                bump(bucket.segments.byPackage, pack, "salesCount", 1);
                bucket.metrics.freePtSessions += Number(sub.packageSnapshot?.free_pt_sessions) || 0;
                bucket.metrics.ptSessionsSold += Number(sub.packageSnapshot?.free_pt_sessions) || 0;
            }
            if (sub.refundedAt && buckets.has(localDateKey(sub.refundedAt, timeZone))) {
                buckets.get(localDateKey(sub.refundedAt, timeZone)).metrics.refundsPiasters += toPiasters(sub.refundAmount);
            } else if ((Number(sub.refundAmount) || 0) > 0) {
                if (focus) buckets.get(focus).quality.undatedRefunds += 1;
            }
            if (sub.refunded && !sub.refundReason && focus) buckets.get(focus).quality.emptyRefundReason += 1;
        }

        for (const pack of member.pt_subscriptions || []) {
            const created = pack.createdAt ? localDateKey(pack.createdAt, timeZone) : null;
            if (created && buckets.has(created)) {
                const bucket = buckets.get(created);
                const net = netPiasters(pack.pricePaid, pack.refundAmount);
                bucket.metrics.ptSalesPiasters += net;
                bucket.metrics.ptSessionsSold += Number(pack.sessions) || 0;
                if (!Number(pack.pricePaid)) bucket.quality.zeroPtPrice += 1;
            }
            if (pack.refundedAt && buckets.has(localDateKey(pack.refundedAt, timeZone))) {
                buckets.get(localDateKey(pack.refundedAt, timeZone)).metrics.refundsPiasters += toPiasters(pack.refundAmount);
            }
        }

        const createdKey = member.createdAt ? localDateKey(member.createdAt, timeZone) : null;
        if (createdKey && buckets.has(createdKey) && member.source !== DATA_ENTRY) {
            const bucket = buckets.get(createdKey);
            bucket.metrics.peopleAdded += 1;
            const converted = (member.subscriptions || []).length > 0;
            if (converted) bucket.metrics.peopleConverted += 1;
            if (!member.source) bucket.quality.nullSource += 1;
            const assignee = member.assignedSales ? String(member.assignedSales._id || member.assignedSales) : "unassigned";
            bump(bucket.segments.byAssignee, assignee, "added", 1);
            if (converted) bump(bucket.segments.byAssignee, assignee, "converted", 1);
            const note = (member.notes || [])
                .map((row) => parseDate(row.createdAt))
                .filter(Boolean)
                .sort((a, b) => a - b)[0];
            if (note && member.createdAt) {
                const hours = (note.getTime() - new Date(member.createdAt).getTime()) / 3600000;
                if (hours >= 0) bucket.samples.firstNoteHours.push(Math.round(hours * 10) / 10);
            }
        }

        applyAttendanceLogs(member, buckets, timeZone, desk, first);

        if (!focus) continue;
        const remaining = Math.max(0, (Number(member.PT_sessions) || 0) - (Number(member.used_PT_sessions) || 0));
        ptRemainingSessions += remaining;
        const exp = parseDate(member.PT_sessions_expDate);
        if (remaining > 0 && exp && exp >= focusRange.start && exp < new Date(focusEnd.getTime() + 30 * DAY_MS)) {
            const packSessions = (member.pt_subscriptions || []).reduce((sum, pack) => sum + (Number(pack.sessions) || 0), 0);
            const packPaid = (member.pt_subscriptions || []).reduce((sum, pack) => sum + netPiasters(pack.pricePaid, pack.refundAmount), 0);
            const each = packSessions > 0 ? Math.round(packPaid / packSessions) : 0;
            ptExpiringSessions += remaining;
            ptExpiringPiasters += remaining * each;
            lists.ptExpiring.push(publicMember(member, { sessions: remaining, piasters: remaining * each, expires: exp.toISOString() }));
        }

        const coverageEnd = [...merged].reverse().find((interval) => interval.start <= focusEnd && interval.end >= focusRange.start)?.end
            || (merged.length ? merged[merged.length - 1].end : null);
        const coveredNow = isCovered(merged, new Date(focusEnd.getTime() - 1));
        if (coveredNow && coverageEnd) {
            const until = coverageEnd.getTime() - focusEnd.getTime();
            if (until >= 0 && until <= 14 * DAY_MS) {
                lists.expiring.push(publicMember(member, { ends: coverageEnd.toISOString() }));
            }
        }

        const checkTimes = (member.userlog || [])
            .filter((log) => log.type === "check-in" && log.createdAt && logBelongsToDesk(log, member, desk))
            .map((log) => new Date(log.createdAt).getTime());
        const inWindow = (ms, days) => checkTimes.filter((t) => t >= focusEnd.getTime() - days * DAY_MS && t < focusEnd.getTime());
        const last14 = inWindow(focusEnd, 14).length;
        const prior14 = checkTimes.filter((t) => t >= focusEnd.getTime() - 28 * DAY_MS && t < focusEnd.getTime() - 14 * DAY_MS).length;
        const last21 = inWindow(focusEnd, 21).length;
        const last28 = inWindow(focusEnd, 28).length;
        const last45 = inWindow(focusEnd, 45).length;
        const activeLike = member.status === "active" || member.status === "frozen" || coveredNow;
        if (activeLike && prior14 >= 2 && last14 * 2 <= prior14) {
            lists.declining.push(publicMember(member, { recentVisits: last14, previousVisits: prior14 }));
        }
        if (activeLike && last45 === 0 && (member.subscriptions || []).length) {
            lists.dormant.push(publicMember(member, { quietDays: 45 }));
        }
        const expiringSoon = coveredNow && coverageEnd && coverageEnd.getTime() - focusEnd.getTime() <= 14 * DAY_MS && coverageEnd >= focusRange.start;
        if (activeLike && (last21 === 0 || (expiringSoon && last28 < 4))) {
            lists.atRisk.push(publicMember(member, {
                quiet: last21 === 0,
                expiring: Boolean(expiringSoon),
                ends: coverageEnd ? coverageEnd.toISOString() : null,
            }));
        }
        if (member.status === "frozen") {
            const due = (member.freeze || []).some((freeze) => freeze.endDate && inRange(freeze.endDate, focusRange.start, focusRange.end));
            if (due) lists.frozenDue.push(publicMember(member, {}));
        }
    }

    // Visitors whose home is another branch but who checked in / trained at this desk
    if (desk && Array.isArray(attendanceExtras) && attendanceExtras.length) {
        for (const visitor of attendanceExtras) {
            const first = subscriptionIntervals(visitor)[0];
            applyAttendanceLogs(visitor, buckets, timeZone, desk, first);
        }
    }

    let duplicatePhones = 0;
    for (const count of phoneCounts.values()) if (count > 1) duplicatePhones += 1;

    const days = keys.map((key) => finalizeBucket(buckets.get(key)));
    const focusBucket = days.find((day) => day.localDate === focus);
    if (focusBucket) {
        focusBucket.metrics.ptRemainingSessions = ptRemainingSessions;
        focusBucket.metrics.ptExpiringSessions = ptExpiringSessions;
        focusBucket.metrics.ptExpiringPiasters = ptExpiringPiasters;
        focusBucket.metrics.targetsSumPiasters = Math.round(Number(targetsSumPiasters) || 0);
        focusBucket.pending = pending || { total: 0, over3: 0, under1: 0, d1to3: 0 };
        focusBucket.lists = {
            expiring: lists.expiring.sort((a, b) => String(a.ends).localeCompare(String(b.ends))).slice(0, LIST_CAP),
            atRisk: lists.atRisk.slice(0, LIST_CAP),
            declining: lists.declining.slice(0, LIST_CAP),
            dormant: lists.dormant.slice(0, LIST_CAP),
            ptExpiring: lists.ptExpiring.sort((a, b) => b.sessions - a.sessions).slice(0, LIST_CAP),
            frozenDue: lists.frozenDue.slice(0, LIST_CAP),
        };
        focusBucket.quality.duplicatePhoneGroups = duplicatePhones;
        focusBucket.quality.listCapped = Object.values(focusBucket.lists).some((rows) => rows.length >= LIST_CAP);
    }

    return { days, focusDate: focus };
}

function finalizeBucket(bucket) {
    const { visitors, ...rest } = bucket;
    rest.metrics.distinctVisitors = visitors.size;
    rest.samples.firstNoteHours = bucket.samples.firstNoteHours.slice(0, 500);
    rest.samples.renewalPiasters = bucket.samples.renewalPiasters.slice(0, 500);
    rest.metrics.medianHoursToNote = median(rest.samples.firstNoteHours);
    rest.metrics.medianRenewalPiasters = median(rest.samples.renewalPiasters);
    rest.segments = {
        byActivity: Object.values(bucket.segments.byActivity),
        byPackage: Object.values(bucket.segments.byPackage).sort((a, b) => b.salesPiasters - a.salesPiasters).slice(0, 8),
        byAssignee: Object.values(bucket.segments.byAssignee),
        byCoach: Object.values(bucket.segments.byCoach),
    };
    delete rest.visitors;
    return rest;
}

function sumMetrics(days, key) {
    return days.reduce((sum, day) => sum + (Number(day.metrics?.[key]) || 0), 0);
}

function rate(part, whole, min = MIN_RATE_SAMPLE, sample = whole) {
    const size = sample == null ? whole : sample;
    if (!whole || size < min) return { value: null, insufficient: true, sample: size || 0, min };
    return { value: part / whole, insufficient: false, sample: size, min };
}

function windowRates(days) {
    const ended = sumMetrics(days, "termsEnded");
    const renewed = sumMetrics(days, "termsRenewed");
    const added = sumMetrics(days, "peopleAdded");
    const converted = sumMetrics(days, "peopleConverted");
    const sales = sumMetrics(days, "membershipSalesPiasters");
    const refunds = sumMetrics(days, "refundsPiasters");
    const list = sumMetrics(days, "listPricePiasters");
    const gap = sumMetrics(days, "discountGapPiasters");
    const sold = sumMetrics(days, "ptSessionsSold");
    const used = sumMetrics(days, "ptSessionsUsed");
    const salesCount = sumMetrics(days, "salesCount");
    const noteSamples = days.flatMap((day) => day.samples?.firstNoteHours || []);
    return {
        renewalRate: rate(renewed, ended),
        conversionRate: rate(converted, added),
        refundRate: rate(refunds, sales, MIN_RATE_SAMPLE, salesCount),
        discountShare: list > 0 && salesCount >= MIN_RATE_SAMPLE ? { value: gap / list, insufficient: false, sample: salesCount, min: MIN_RATE_SAMPLE } : { value: null, insufficient: true, sample: salesCount, min: MIN_RATE_SAMPLE },
        ptUtilization: rate(used, sold),
        medianHoursToNote: noteSamples.length >= MIN_RATE_SAMPLE ? { value: median(noteSamples), insufficient: false, sample: noteSamples.length, min: MIN_RATE_SAMPLE } : { value: null, insufficient: true, sample: noteSamples.length, min: MIN_RATE_SAMPLE },
        membershipSalesPiasters: sales,
        termsEnded: ended,
        termsRenewed: renewed,
    };
}

function suggestTarget(baseline, kind) {
    const B = Number(baseline);
    if (!Number.isFinite(B)) return null;
    if (kind === "rate") {
        return {
            achievable: round4(B + Math.min(0.05, (1 - B) * 0.15)),
            stretch: round4(B + Math.min(0.1, (1 - B) * 0.3)),
        };
    }
    if (kind === "duration") {
        return {
            achievable: Math.max(1, round4(B * 0.8)),
            stretch: Math.max(1, round4(B * 0.6)),
        };
    }
    return {
        achievable: Math.round(B * 1.1),
        stretch: Math.round(B * 1.2),
    };
}

function round4(n) {
    return Math.round(n * 10000) / 10000;
}

function paceStatus({ baseline, target, actual, start, deadline, now, direction }) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(deadline).getTime();
    const nowMs = new Date(now).getTime();
    const span = Math.max(1, endMs - startMs);
    const elapsed = Math.min(1, Math.max(0, (nowMs - startMs) / span));
    const change = target - baseline;
    const expected = baseline + change * elapsed;
    const progress = change === 0 ? 1 : (actual - baseline) / change;
    const pace = elapsed === 0 ? null : progress / elapsed;
    const met = direction === "down" ? actual <= target : actual >= target;
    let status = "on_track";
    if (met) status = "achieved";
    else if (nowMs > endMs) status = "missed";
    else if (pace == null) status = "on_track";
    else if (pace < 0.7) status = "off_track";
    else if (pace < 0.9) status = "at_risk";
    const velocity = elapsed === 0 ? 0 : (actual - baseline) / ((nowMs - startMs) / DAY_MS);
    let projected = null;
    if (!met && velocity !== 0 && Math.sign(velocity) === Math.sign(change)) {
        const daysNeeded = (target - baseline) / velocity;
        projected = new Date(startMs + daysNeeded * DAY_MS).toISOString();
    }
    return {
        elapsed,
        expected,
        progress,
        pace,
        status,
        projected,
        behind: status === "at_risk" || status === "off_track",
    };
}

function quietHourShare(days) {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    let total = 0;
    for (const day of days) {
        const weekday = day.weekday ?? 0;
        for (let hour = 0; hour < 24; hour += 1) {
            const n = day.hours?.[hour] || 0;
            grid[weekday][hour] += n;
            total += n;
        }
    }
    const cells = [];
    for (let w = 0; w < 7; w += 1) {
        for (let h = 0; h < 24; h += 1) if (grid[w][h] > 0) cells.push(grid[w][h]);
    }
    if (!cells.length || total === 0) return { share: null, total, block: null };
    const sorted = [...cells].sort((a, b) => a - b);
    const quartile = sorted[Math.floor((sorted.length - 1) / 4)];
    let quiet = 0;
    let best = null;
    for (let w = 0; w < 7; w += 1) {
        for (let h = 0; h < 23; h += 1) {
            const block = grid[w][h] + grid[w][h + 1];
            if (grid[w][h] <= quartile) quiet += grid[w][h];
            if (!best || block < best.visits) best = { weekday: w, hour: h, visits: block };
        }
    }
    return { share: quiet / total, total, block: best, grid };
}

function evaluateInsights({ focus, recentDays, priorDays }) {
    const insights = [];
    const atRisk = focus?.lists?.atRisk || [];
    const quietExpiring = atRisk.filter((row) => row.quiet && row.expiring);
    if (quietExpiring.length >= 8) {
        insights.push({
            ruleKey: "renewals_quiet",
            role: "Owner",
            impact: quietExpiring.length,
            title: `${quietExpiring.length} members expire within 14 days and have not visited in 21 days`,
            action: "Call this list before the membership ends.",
            href: "expiring",
        });
    }
    const heat = quietHourShare(recentDays || []);
    if (heat.total >= 200 && heat.block && heat.block.visits * 2 < (heat.total / 28)) {
        insights.push({
            ruleKey: "quiet_block",
            role: "Owner",
            impact: heat.block.visits,
            title: `A two-hour block is among the quietest this month (${heat.block.visits} check-ins).`,
            action: "Promote that block. Capacity percent is unavailable until an hourly cap is set.",
            href: "heatmap",
            evidence: heat.block,
        });
    }
    const assignees = new Map();
    for (const day of recentDays || []) {
        for (const row of day.segments?.byAssignee || []) {
            const cur = assignees.get(row.key) || { added: 0, converted: 0 };
            cur.added += row.added || 0;
            cur.converted += row.converted || 0;
            assignees.set(row.key, cur);
        }
    }
    let teamAdded = 0;
    let teamConverted = 0;
    for (const row of assignees.values()) {
        teamAdded += row.added;
        teamConverted += row.converted;
    }
    if (teamAdded >= 30) {
        const teamRate = teamConverted / teamAdded;
        for (const [userId, row] of assignees) {
            if (userId === "unassigned" || row.added < 10) continue;
            const rate = row.converted / row.added;
            if (rate * 2 < teamRate) {
                insights.push({
                    ruleKey: `rep_conversion:${userId}`,
                    role: "Sales Manager",
                    impact: row.added,
                    title: `One rep converted ${Math.round(rate * 100)}% versus the team ${Math.round(teamRate * 100)}%.`,
                    action: "Review their unanswered guests and how fast the first note was written. This is conversion, not revenue credit.",
                    href: "funnel",
                });
            }
        }
    }
    if ((focus?.metrics?.ptExpiringSessions || 0) >= 10) {
        insights.push({
            ruleKey: "pt_expiring",
            role: "Head Coach",
            impact: focus.metrics.ptExpiringPiasters || focus.metrics.ptExpiringSessions,
            title: `${focus.metrics.ptExpiringSessions} PT sessions expire unused within 30 days.`,
            action: "Book those members. The money figure uses their own pack price, and the session counter is gym-wide rather than per pack.",
            href: "pt",
        });
    }
    const recent = windowRates(recentDays || []);
    const prior = windowRates(priorDays || []);
    if (!recent.discountShare.insufficient && recent.discountShare.value > 0.08) {
        insights.push({
            ruleKey: "discount_gap",
            role: "Accountant",
            impact: sumMetrics(recentDays || [], "discountGapPiasters"),
            title: `Discounts are ${Math.round(recent.discountShare.value * 100)}% of list price over the recent window.`,
            action: "Review exception sales.",
            href: "accounting",
        });
    }
    if (!recent.refundRate.insufficient && !prior.refundRate.insufficient && recent.refundRate.value >= prior.refundRate.value + 0.05) {
        insights.push({
            ruleKey: "refunds_up",
            role: "Accountant",
            impact: sumMetrics(recentDays || [], "refundsPiasters"),
            title: "The refund rate is at least 5 points above the previous window.",
            action: "Open the refunded sales and read the reasons that were recorded.",
            href: "accounting",
        });
    }
    if ((focus?.pending?.over3 || 0) > 0) {
        insights.push({
            ruleKey: "approvals_stuck",
            role: "Owner",
            impact: focus.pending.over3,
            title: `${focus.pending.over3} approval${focus.pending.over3 === 1 ? "" : "s"} have been waiting more than 3 days.`,
            action: "Clear the pending package and assignment requests.",
            href: "pending",
        });
    }
    if (!recent.medianHoursToNote.insufficient && recent.medianHoursToNote.value > 24) {
        insights.push({
            ruleKey: "slow_followup",
            role: "Sales Manager",
            impact: recent.medianHoursToNote.sample,
            title: `The median time to the first note is ${recent.medianHoursToNote.value} hours.`,
            action: "Open guests with no note. A note is only a proxy for a real contact.",
            href: "funnel",
        });
    }
    const target = focus?.metrics?.targetsSumPiasters || 0;
    const today = focus ? new Date(focus.localDate) : null;
    if (target > 0 && today && today.getUTCDate() >= 10) {
        const monthDays = recentDays || [];
        const monthSales = sumMetrics(monthDays, "membershipSalesPiasters");
        const elapsed = today.getUTCDate() / 30;
        if (monthSales < target * elapsed * 0.9) {
            insights.push({
                ruleKey: "quota_pace",
                role: "Sales Manager",
                impact: target - monthSales,
                title: "Membership sales are behind the combined rep quotas for this month.",
                action: "The quota is the sum of the targets already set on each rep. Sales are not split by person.",
                href: "accounting",
            });
        }
    }
    return insights.sort((a, b) => (b.impact || 0) - (a.impact || 0));
}

function buildCohorts(members, now, timeZone, months = 6) {
    const groups = new Map();
    for (const member of members || []) {
        const first = subscriptionIntervals(member)[0];
        if (!first) continue;
        const cohort = monthKeyOf(localDateKey(first.start, timeZone));
        if (!groups.has(cohort)) groups.set(cohort, []);
        groups.get(cohort).push(spells(member, now));
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-months).map(([cohort, rows]) => {
        const [year, month] = cohort.split("-").map(Number);
        const cells = [];
        for (let n = 0; n < 12; n += 1) {
            const probeKey = `${new Date(Date.UTC(year, month - 1 + n + 1, 0)).getUTCFullYear()}-${String(new Date(Date.UTC(year, month - 1 + n + 1, 0)).getUTCMonth() + 1).padStart(2, "0")}-01`;
            const probe = new Date(zonedEndOfMonth(year, month + n, timeZone));
            if (probe > now) {
                cells.push(null);
                continue;
            }
            const covered = rows.filter((merged) => isCovered(merged, probe)).length;
            cells.push(rows.length ? covered / rows.length : null);
            void probeKey;
        }
        return { cohort, size: rows.length, cells };
    });
}

function zonedEndOfMonth(year, monthIndex1, timeZone) {
    const month = ((monthIndex1 - 1) % 12) + 1;
    const yearAdj = year + Math.floor((monthIndex1 - 1) / 12);
    const last = new Date(Date.UTC(yearAdj, month, 0));
    const key = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
    return dayRange(key, timeZone).end.getTime() - 1;
}

function forecastFrom(focus, recentDays) {
    const rates = windowRates(recentDays || []);
    const expiring = focus?.lists?.expiring?.length || 0;
    if (rates.renewalRate.insufficient) {
        return { revenuePiasters: null, insufficient: true, sample: rates.renewalRate.sample, expiring };
    }
    const medianRenewal = median((recentDays || []).flatMap((day) => day.samples?.renewalPiasters || []));
    if (medianRenewal == null) return { revenuePiasters: null, insufficient: true, sample: rates.renewalRate.sample, expiring };
    return {
        revenuePiasters: Math.round(expiring * rates.renewalRate.value * medianRenewal),
        insufficient: false,
        renewalRate: rates.renewalRate.value,
        medianRenewalPiasters: medianRenewal,
        expiring,
        label: "Estimate: memberships ending soon × this gym's renewal rate × the median renewal amount.",
    };
}

module.exports = {
    GRACE_MS,
    MIN_RATE_SAMPLE,
    LIST_CAP,
    METRICS,
    TEMPLATES,
    computeDays,
    windowRates,
    suggestTarget,
    paceStatus,
    evaluateInsights,
    quietHourShare,
    buildCohorts,
    forecastFrom,
    saleFigures,
    spells,
    median,
};
