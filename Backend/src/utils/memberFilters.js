function numericId(value) {
    const raw = String(value ?? "").trim().replace(/^[sS]/, "");
    if (!/^\d+$/.test(raw)) return null;
    return Number(raw);
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
    unassignedSales,
    unassignedCoach,
    dateFrom,
    dateTo,
    dateField,
    packageId,
    gender,
    transferType,
}) {
    const filter = {};

    if (status === "blocked") {
        filter.isBlocked = true;
    } else if (status && status !== "all") {
        filter.status = status;
        filter.isBlocked = { $ne: true };
    }

    if (unassignedSales === "true" || unassignedSales === true) {
        filter.$or = filter.$or || [];
        filter.assignedSales = null;
    } else if (assignedSales && assignedSales !== "null" && assignedSales !== "undefined") {
        filter.assignedSales = assignedSales;
    }

    if (unassignedCoach === "true" || unassignedCoach === true) {
        filter.current_couch = null;
    } else if (currentCouch && currentCouch !== "null" && currentCouch !== "undefined") {
        filter.current_couch = currentCouch;
    }

    if (gender && gender !== "all") {
        filter.gender = gender;
    }

    if (packageId && packageId !== "all") {
        filter["subscriptions.package"] = packageId;
    }

    // Transfer filters
    if (transferType === "transferred" || transferred === "true" || transferred === true) {
        filter.userlog = { $elemMatch: { type: "assign" } };
    } else if (transferType === "never") {
        filter["userlog.type"] = { $ne: "assign" };
    } else if (transferType === "bulk") {
        filter.userlog = { $elemMatch: { type: "assign", text: /bulk/i } };
    } else if (transferType === "coach") {
        filter.userlog = { $elemMatch: { type: "assign", text: /coach|couch/i } };
    } else if (transferType === "sales") {
        filter.userlog = { $elemMatch: { type: "assign", text: /sales|salesman|sales rep/i } };
    }

    // Period / Date filters
    if (dateFrom || dateTo) {
        const range = {};
        if (dateFrom) range.$gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            range.$lte = end;
        }

        if (dateField === "joined" || dateField === "createdAt") {
            filter.createdAt = range;
        } else if (dateField === "startDate") {
            filter["subscriptions.startDate"] = range;
        } else if (dateField === "transferDate") {
            filter.userlog = { $elemMatch: { type: "assign", createdAt: range } };
        } else {
            // Default period filter applies to subscription end date (membership period)
            filter["subscriptions.endDate"] = range;
        }
    }

    if (recent === "true" || recent === true) {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        filter.createdAt = { $gte: since };
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
        // Use $elemMatch so both conditions must match the SAME subscription element
        filter["subscriptions"] = {
            $elemMatch: {
                endDate: { $gte: startOfToday, $lte: endOf7thDay },
                refunded: { $ne: true },
                cancelled: { $ne: true },
            }
        };
        // Remove any old subscriptions.endDate key if present
        delete filter["subscriptions.endDate"];
    }

    if (search?.trim()) {
        const q = search.trim();
        const or = [
            { name: { $regex: q, $options: "i" } },
            { phones: { $regex: q, $options: "i" } },
        ];
        const num = numericId(q);
        if (num != null) {
            or.push({ systemId: num }, { memberId: num });
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
    delete statsFilter["subscriptions"];
    delete statsFilter["subscriptions.package"];
    delete statsFilter.createdAt;
    delete statsFilter.userlog;
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
