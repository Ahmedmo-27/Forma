const Member = require("../models/Member");
const PackageExceptionRequest = require("../models/PackageExceptionRequest");
const User = require("../models/User");
const ContractSignature = require("../models/ContractSignature");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { isSameDay, zonedMidnightUtc, addLocalDays, CAIRO_ZONE, subscriptionSalePrice } = require("../utils/revenueUtils");
const { resolveSubscriptionPackage } = require("../utils/packageSnapshot");
const { isForfeitedCancellation } = require("../utils/subscriptionUtils");

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
    const matched = matchAcceptedRequest(acceptedRequests, memberId, sub, timeZone);

    if (sub.approvedBy) {
        const salesManager = sub.salesManager ?? matched?.proposedBy ?? null;
        return {
            approvedBy: sub.approvedBy,
            salesManager,
            // Keep direct_assignment when no sales person; attributed sales are standard_sale
            // unless they came from an accepted package request.
            source: matched
                ? "approved_request"
                : (salesManager ? "standard_sale" : "direct_assignment"),
        };
    }

    if (matched) {
        return {
            approvedBy: matched.reviewedBy,
            salesManager: matched.proposedBy,
            source: "approved_request",
        };
    }

    const createdById = sub.createdBy?._id?.toString() ?? sub.createdBy?.toString();
    if (createdById && financeUserIds.has(createdById) && !sub.salesManager) {
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
        // Auth is enforced by allowRoles("contracts", ...) on the route.
        const timeZone = req.tenant?.settings?.locale?.timezone || CAIRO_ZONE;
        const { page, limit, skip } = parsePagination(req.query);
        const { dateFrom, dateTo } = req.query;

        const memberFilter = {
            "subscriptions.0": { $exists: true },
            ...(req.locationFilter || {}),
        };

        const [members, acceptedRequests, financeUsers] = await Promise.all([
            Member.find(memberFilter)
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
                const refundAmount = Number(sub.refundAmount) || 0;
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
                    refundAmount,
                    refunded: Boolean(sub.refunded) || refundAmount > 0,
                    cancelled: isForfeitedCancellation(sub),
                    cancelReason: sub.cancelReason || null,
                    netPaid: subscriptionSalePrice(sub),
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
        const totalRevenue = contracts.reduce((sum, c) => sum + (c.netPaid || 0), 0);
        const pageItems = contracts.slice(skip, skip + limit);
        const signatures = pageItems.length
            ? await ContractSignature.find({ subscription: { $in: pageItems.map((c) => c._id) } })
                .select("subscription signedAt signerName")
                .lean()
            : [];
        const signedBySub = new Map(signatures.map((s) => [String(s.subscription), s]));
        for (const item of pageItems) {
            const signature = signedBySub.get(String(item._id));
            item.signed = Boolean(signature);
            item.signedAt = signature?.signedAt || null;
            item.signerName = signature?.signerName || null;
        }

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
