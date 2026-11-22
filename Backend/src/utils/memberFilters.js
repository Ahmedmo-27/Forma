const { escapeRegex } = require("./username");

function numericId(value) {
    const raw = String(value ?? "").trim().replace(/^[sS]/, "");
    if (!/^\d+$/.test(raw)) return null;
    return Number(raw);
}

function pushAnd(filter, clause) {
    if (!filter.$and) filter.$and = [];
    filter.$and.push(clause);
}

function stashUserlogConstraints(filter) {
    if (filter.userlog) {
        pushAnd(filter, { userlog: filter.userlog });
        delete filter.userlog;
    }
    if (filter["userlog.type"]) {
        pushAnd(filter, { "userlog.type": filter["userlog.type"] });
        delete filter["userlog.type"];
    }
}

function setUserlogElemMatch(filter, elemMatch) {
    stashUserlogConstraints(filter);
    filter.userlog = { $elemMatch: elemMatch };
}

function setCreatedAtRange(filter, range) {
    if (filter.createdAt) {
        pushAnd(filter, { createdAt: filter.createdAt });
        delete filter.createdAt;
    }
    filter.createdAt = range;
}

function stashSubscriptionPeriodKeys(filter) {
    if (filter.subscriptions) {
        pushAnd(filter, { subscriptions: filter.subscriptions });
        delete filter.subscriptions;
    }
    if (filter["subscriptions.endDate"]) {
        pushAnd(filter, { "subscriptions.endDate": filter["subscriptions.endDate"] });
        delete filter["subscriptions.endDate"];
    }
}

function buildDateRange(dateFrom, dateTo) {
    const range = {};
    if (dateFrom) range.$gte = new Date(dateFrom);
    if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
    }
    return Object.keys(range).length ? range : null;
}

function buildMemberListFilter({
    status,
    search,
    assignedSales,
    subscribedToday,
    transferred,
    recent,
    expiringSoon,
    currentCouch,
    dateFrom,
    dateTo,
    dateField,
    packageId,
    gender,
    transferType,
    source,
    locationId,
    locationFilter,
}) {
    const filter = {};

    if (locationFilter && typeof locationFilter === "object") {
        Object.assign(filter, locationFilter);
    } else if (locationId && locationId !== "all") {
        filter.locationId = locationId;
    }

    if (status === "blocked") {
        filter.isBlocked = true;
    } else if (status && status !== "all") {
        filter.status = status;
        filter.isBlocked = { $ne: true };
    }

    if (assignedSales && assignedSales !== "null" && assignedSales !== "undefined") {
        filter.assignedSales = assignedSales;
    }

    if (currentCouch && currentCouch !== "null" && currentCouch !== "undefined") {
        filter.current_couch = currentCouch;
    }

    if (gender && gender !== "all" && gender !== "All") {
        filter.gender = gender;
    }

    if (packageId && packageId !== "all" && packageId !== "All") {
        filter["subscriptions.package"] = packageId;
    }

    if (source && source !== "all" && source !== "All") {
        filter.source = source;
    }

    const periodRange = buildDateRange(dateFrom, dateTo);
    const normalizedDateField = dateField === "joined" ? "createdAt" : dateField;

    // Transfer history constraints (merged with transfer-date period when both are set)
    let userlogElem = null;
    if (transferType === "transferred" || transferred === "true" || transferred === true) {
        userlogElem = { type: "assign" };
    } else if (transferType === "bulk") {
        userlogElem = { type: "assign", text: /bulk/i };
    } else if (transferType === "coach") {
        userlogElem = { type: "assign", text: /coach|couch/i };
    } else if (transferType === "sales") {
        userlogElem = { type: "assign", text: /sales|salesman|sales rep/i };
    } else if (transferType === "never") {
        filter["userlog.type"] = { $ne: "assign" };
    }

    if (periodRange && normalizedDateField === "transferDate") {
        userlogElem = {
            ...(userlogElem || {}),
            type: "assign",
            createdAt: periodRange,
        };
    }

    if (userlogElem) {
        setUserlogElemMatch(filter, userlogElem);
    }

    if (periodRange && normalizedDateField !== "transferDate") {
        if (normalizedDateField === "createdAt") {
            setCreatedAtRange(filter, periodRange);
        } else if (normalizedDateField === "startDate") {
            filter["subscriptions.startDate"] = periodRange;
        } else {
            stashSubscriptionPeriodKeys(filter);
            filter["subscriptions.endDate"] = periodRange;
        }
    }

    if (recent === "true" || recent === true) {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        setCreatedAtRange(filter, { $gte: since });
    }

    if (subscribedToday === "true") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filter["subscriptions.createdAt"] = { $gte: start, $lt: end };
    }

    if (expiringSoon === "true" || expiringSoon === true) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOf7thDay = new Date(startOfToday);
        endOf7thDay.setDate(endOf7thDay.getDate() + 7);
        endOf7thDay.setHours(23, 59, 59, 999);
        if (!filter.status) filter.status = "active";
        stashSubscriptionPeriodKeys(filter);
        filter.subscriptions = {
            $elemMatch: {
                endDate: { $gte: startOfToday, $lte: endOf7thDay },
                refunded: { $ne: true },
                cancelled: { $ne: true },
            },
        };
    }

    if (search?.trim()) {
        const q = search.trim();
        const safe = escapeRegex(q);
        const or = [
            { name: { $regex: safe, $options: "i" } },
            { phones: { $regex: safe, $options: "i" } },
        ];
        const mMatch = /^m(\d+)$/i.exec(q);
        if (mMatch) {
            or.push({ memberId: Number(mMatch[1]) });
        } else {
            const num = numericId(q);
            if (num != null) {
                or.push({ systemId: num }, { memberId: num });
            }
        }
        if (filter.$or) {
            filter.$and = [{ $or }, { $or: filter.$or }];
            delete filter.$or;
        } else {
            filter.$or = or;
        }
    }

    return filter;
}

/** Status-tab counts stay on the caller's book. The active tab and extra filters only change the rows. */
function statsFilterFromListFilter(filter = {}) {
    const statsFilter = { ...filter };
    delete statsFilter.status;
    delete statsFilter.isBlocked;
    delete statsFilter["subscriptions.createdAt"];
    delete statsFilter["subscriptions.startDate"];
    delete statsFilter["subscriptions.endDate"];
    delete statsFilter.subscriptions;
    delete statsFilter["subscriptions.package"];
    delete statsFilter.createdAt;
    delete statsFilter.userlog;
    delete statsFilter["userlog.type"];
    delete statsFilter.source;
    if (Array.isArray(statsFilter.$and)) {
        statsFilter.$and = statsFilter.$and.filter(
            (clause) =>
                !clause.userlog
                && !clause["userlog.type"]
                && !clause.createdAt
                && !clause.subscriptions
                && !clause["subscriptions.endDate"]
        );
        if (!statsFilter.$and.length) delete statsFilter.$and;
    }
    return statsFilter;
}

/**
 * Count with the same query path as the member list.
 */
async function getMemberStatusStats(Member, baseFilter = {}) {
    const statuses = ["active", "frozen", "expired", "guest"];
    const [total, blocked, active, frozen, expired, guest] = await Promise.all([
        Member.countDocuments(baseFilter),
        Member.countDocuments({ ...baseFilter, isBlocked: true }),
        ...statuses.map((status) => Member.countDocuments({ ...baseFilter, status, isBlocked: { $ne: true } })),
    ]);
    return { total, active, frozen, expired, guest, blocked };
}

module.exports = {
    numericId,
    buildMemberListFilter,
    statsFilterFromListFilter,
    getMemberStatusStats,
};