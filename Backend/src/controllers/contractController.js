const Member = require("../models/Member");
const PackageExceptionRequest = require("../models/PackageExceptionRequest");
const User = require("../models/User");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { isSameDay, zonedMidnightUtc, addLocalDays, CAIRO_ZONE } = require("../utils/revenueUtils");
const { resolveSubscriptionPackage } = require("../utils/packageSnapshot");

const FINANCE_ROLES = ["Accountant", "Owner", "General Manager", "Sales Manager"];

const PACKAGE_FIELDS = "name duration activityType price freezeLimitDays invitationLimit renewalDiscountPercent hasException description";

const matchAcceptedRequest = (requests, memberId, sub, timeZone = CAIRO_ZONE) =>
    requests.find(
        (req) =>
            req.member.toString() === memberId.toString() &&
            req.pricePaid === sub.pricePaid &&
            isSameDay(new Date(req.startDate), new Date(sub.startDate), timeZone)
    );

const resolveContractMeta = (sub, memberId, acceptedRequests, financeUserIds, timeZone = CAIRO_ZONE) => {
    if (sub.approvedBy) {
        let salesManager = sub.salesManager ?? null;
        if (!salesManager) {
            const matched = matchAcceptedRequest(acceptedRequests, memberId, sub, timeZone);
            if (matched) salesManager = matched.proposedBy;
        }
        return {
            approvedBy: sub.approvedBy,
            salesManager,
            source: salesManager ? "approved_request" : "direct_assignment",
        };
    }

    const matched = matchAcceptedRequest(acceptedRequests, memberId, sub, timeZone);
    if (matched) {
        return {
            approvedBy: matched.reviewedBy,
            salesManager: matched.proposedBy,
            source: "approved_request",
        };
    }

    const createdById = sub.createdBy?._id?.toString() ?? sub.createdBy?.toString();
    if (createdById && financeUserIds.has(createdById)) {
        return {
            approvedBy: sub.createdBy,
            salesManager: null,
            source: "direct_assignment",
        };
    }

    if (sub.createdBy) {
        return {
            approvedBy: sub.createdBy,
            salesManager: sub.salesManager || null,
            source: "standard_sale",
        };
    }

    return null;
};

const inDateRange = (date, dateFrom, dateTo, timeZone = CAIRO_ZONE) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    if (dateFrom) {
        const start = zonedMidnightUtc(dateFrom, timeZone);
        if (d < start) return false;
    }
    if (dateTo) {
        const nextDay = zonedMidnightUtc(addLocalDays(dateTo, 1), timeZone);
        if (d >= nextDay) return false;
    }
    return true;
};

const getContracts = async (req, res) => {
    try {
        if (!FINANCE_ROLES.includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const timeZone = req.tenant?.settings?.locale?.timezone || CAIRO_ZONE;
        const { page, limit, skip } = parsePagination(req.query);
        const { dateFrom, dateTo } = req.query;

        const [members, acceptedRequests, financeUsers] = await Promise.all([
            Member.find({ "subscriptions.0": { $exists: true } })
                .populate(`subscriptions.package`, PACKAGE_FIELDS)
                .populate("subscriptions.createdBy", "name email role")
                .populate("subscriptions.approvedBy", "name email role")
                .populate("subscriptions.salesManager", "name email role"),
            PackageExceptionRequest.find({ status: "accepted" })
                .populate("proposedBy", "name email role")
                .populate("reviewedBy", "name email role"),
            User.find({ role: { $in: FINANCE_ROLES } }).select("_id"),
        ]);

        const financeUserIds = new Set(financeUsers.map((u) => u._id.toString()));

        const contracts = [];
        members.forEach((member) => {
            member.subscriptions.forEach((sub) => {
                const meta = resolveContractMeta(sub, member._id, acceptedRequests, financeUserIds, timeZone);
                if (!meta) return;

                const addedAt = sub.createdAt ?? sub.startDate;
                if (!inDateRange(addedAt, dateFrom, dateTo, timeZone)) return;

                const purchasedPkg = resolveSubscriptionPackage(sub);
                contracts.push({
                    _id: sub._id,
                    subscriptionId: sub.subscriptionId,
                    member: {
                        _id: member._id,
                        name: member.name,
                        systemId: member.systemId,
                        memberId: member.memberId,
                        status: member.status,
                    },
                    package: purchasedPkg,
                    packageSnapshot: sub.packageSnapshot || null,
                    startDate: sub.startDate,
                    endDate: sub.endDate,
                    pricePaid: sub.pricePaid,
                    discountPercent: sub.discountPercent,
                    isRenewal: sub.isRenewal,
                    hasException: purchasedPkg?.hasException ?? false,
                    createdAt: addedAt,
                    approvedBy: meta.approvedBy,
                    salesManager: meta.salesManager,
                    source: meta.source,
                });
            });
        });

        contracts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = contracts.length;
        const totalRevenue = contracts.reduce((sum, c) => sum + (c.pricePaid || 0), 0);
        const pageItems = contracts.slice(skip, skip + limit);

        const currency = req.tenant?.settings?.locale?.currency || "EGP";

        res.json({
            contracts: pageItems,
            count: total,
            totalRevenue,
            currency,
            pagination: buildPagination(page, limit, total),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { getContracts };
