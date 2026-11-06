function buildMemberListFilter({ status, search, assignedSales, unassigned, subscribedToday }) {
    const filter = {};

    if (status === "blocked") {
        filter.isBlocked = true;
    } else if (status && status !== "all") {
        filter.status = status;
    }

    if (unassigned === "true") {
        filter.assignedSales = null;
    } else if (assignedSales) {
        filter.assignedSales = assignedSales;
    }

    if (subscribedToday === "true") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filter["subscriptions.createdAt"] = { $gte: start, $lt: end };
    }

    if (search?.trim()) {
        const q = search.trim();
        const or = [
            { name: { $regex: q, $options: "i" } },
            { phones: { $regex: q, $options: "i" } },
        ];
        const num = Number(q);
        if (!Number.isNaN(num)) {
            or.push({ systemId: num }, { memberId: num });
        }
        filter.$or = or;
    }

    return filter;
}

/** Status-tab counts must stay global. The active tab only filters the rows. */
function statsFilterFromListFilter(filter = {}) {
    const statsFilter = { ...filter };
    delete statsFilter.status;
    delete statsFilter.isBlocked;
    delete statsFilter["subscriptions.createdAt"];
    return statsFilter;
}

async function getMemberStatusStats(Member, baseFilter = {}) {
    const [groups, blockedCount] = await Promise.all([
        Member.aggregate([
            { $match: baseFilter },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Member.countDocuments({ ...baseFilter, isBlocked: true }),
    ]);

    const stats = { total: 0, active: 0, frozen: 0, expired: 0, guest: 0, blocked: blockedCount };
    groups.forEach((g) => {
        if (g._id && Object.prototype.hasOwnProperty.call(stats, g._id)) {
            stats[g._id] = g.count;
        }
        stats.total += g.count;
    });
    return stats;
}

module.exports = { buildMemberListFilter, statsFilterFromListFilter, getMemberStatusStats };
