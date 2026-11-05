const PackageExceptionRequest = require("../models/PackageExceptionRequest");
const Package = require("../models/Package");
const Member = require("../models/Member");
const User = require("../models/User");
const { findMemberByIdentifier } = require("../utils/memberLookup");
const { generateBarcode } = require("../utils/barcodeHelper");
const {
    notifyPackageExceptionPending,
    notifyPackageExceptionResolved,
} = require("../utils/notificationService");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { writeAudit } = require("../utils/audit");
const { buildPackageSnapshot } = require("../utils/packageSnapshot");
const { nextMemberId, nextSubscriptionId } = require("../utils/sequence");

const calcEndDate = (startDate, duration) => {
    const end = new Date(startDate);
    switch (duration) {
        case "1 month":  end.setMonth(end.getMonth() + 1); break;
        case "3 months": end.setMonth(end.getMonth() + 3); break;
        case "6 months": end.setMonth(end.getMonth() + 6); break;
        case "1 year":   end.setFullYear(end.getFullYear() + 1); break;
    }
    return end;
};

const generateMemberId = async () => {
    return nextMemberId();
};

const generateSubscriptionId = async () => {
    return nextSubscriptionId();
};

const buildExceptionPackage = async (request, memberId, userId, freePtSessions = 0) => {
    return Package.create({
        name: request.name,
        activityType: request.activityType,
        duration: request.duration,
        price: request.price,
        freezeLimitDays: request.freezeLimitDays,
        invitationLimit: request.invitationLimit,
        renewalDiscountPercent: request.renewalDiscountPercent,
        description: request.description,
        isActive: true,
        hasException: true,
        basedOn: request.basePackage,
        forMember: memberId,
        createdBy: userId,
        free_pt_sessions: freePtSessions,
    });
};

const applyApprovedException = async (request, reviewerId) => {
    const member = await Member.findById(request.member);
    if (!member) throw new Error("Member not found");

    const basePkg = await Package.findById(request.basePackage);
    const freePtSessions = basePkg?.free_pt_sessions || 0;

    let packageId;
    let packageName;
    let snapshotSource;

    if (request.hasException) {
        const exceptionPkg = await buildExceptionPackage(
            request,
            member._id,
            request.proposedBy,
            freePtSessions
        );
        packageId = exceptionPkg._id;
        packageName = exceptionPkg.name;
        snapshotSource = exceptionPkg;
    } else {
        packageId = request.basePackage;
        packageName = basePkg?.name ?? request.name;
        // Snapshot approved request terms (not live catalog) so later catalog edits are ignored
        snapshotSource = {
            name: request.name,
            activityType: request.activityType,
            duration: request.duration,
            price: request.price,
            freezeLimitDays: request.freezeLimitDays,
            invitationLimit: request.invitationLimit,
            renewalDiscountPercent: request.renewalDiscountPercent,
            description: request.description,
            hasException: false,
            free_pt_sessions: freePtSessions,
        };
    }

    const startDate = request.startDate ? new Date(request.startDate) : new Date();
    const endDate = calcEndDate(startDate, request.duration);
    const subscriptionId = await generateSubscriptionId();
    const hadSubscription = member.subscriptions?.length > 0;
    const startsNowOrPast = startDate <= new Date();

    const subscription = {
        subscriptionId,
        package: packageId,
        packageSnapshot: buildPackageSnapshot(snapshotSource),
        startDate,
        endDate,
        pricePaid: request.pricePaid,
        discountPercent: request.discountPercent ?? 0,
        isRenewal: hadSubscription,
        createdBy: request.proposedBy,
        approvedBy: reviewerId,
        salesManager: request.proposedBy,
    };

    if (!member.memberId) {
        member.memberId = await generateMemberId();
    }
    if (!member.barcode && member.memberId) {
        member.barcode = generateBarcode(member.memberId);
    }

    member.isMember = true;
    if (startsNowOrPast) {
        member.status = "active";
        member.freezeDaysUsed = 0;
        member.invitationsUsed = 0;
    }
    member.subscriptions.push(subscription);
    member.PT_sessions = (member.PT_sessions || 0) + freePtSessions;
    member.userlog.push({
        type: hadSubscription ? "renewal" : "other",
        text: request.hasException
            ? `Package exception approved by accountant (${packageName})`
            : `Package request approved by accountant (${packageName})`,
        createdBy: reviewerId,
    });

    await member.save();
    return member;
};

// Sales Manager proposes a package exception for a member
const createException = async (req, res) => {
    try {
        const {
            memberId,
            basePackageId,
            name,
            activityType,
            duration,
            price,
            freezeLimitDays,
            invitationLimit,
            renewalDiscountPercent,
            description,
            pricePaid,
            discountPercent,
            startDate,
            reason,
        } = req.body;

        if (!memberId || !basePackageId) {
            return res.status(400).json({ message: "Member ID and base package are required" });
        }

        const member = await findMemberByIdentifier(memberId);
        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        const basePkg = await Package.findById(basePackageId);
        if (!basePkg || !basePkg.isActive || basePkg.hasException) {
            return res.status(400).json({ message: "Base package not found or unavailable" });
        }

        const existing = await PackageExceptionRequest.findOne({
            member: member._id,
            status: "pending",
        });
        if (existing) {
            return res.status(400).json({ message: "This member already has a pending package exception" });
        }

        const proposer = await User.findById(req.user.id).select("name");
        const packageName = name ?? basePkg.name;
        const isException = Boolean(req.body.hasException);
        const notificationMessage = isException
            ? `${proposer?.name || "Sales Manager"} added package ${packageName} with exception to member ${member.name}`
            : `${proposer?.name || "Sales Manager"} requested package ${packageName} for member ${member.name}`;

        const request = await PackageExceptionRequest.create({
            member: member._id,
            basePackage: basePkg._id,
            proposedBy: req.user.id,
            hasException: isException,
            name: name ?? basePkg.name,
            activityType: activityType ?? basePkg.activityType,
            duration: duration ?? basePkg.duration,
            price: price ?? basePkg.price,
            freezeLimitDays: freezeLimitDays ?? basePkg.freezeLimitDays,
            invitationLimit: invitationLimit ?? basePkg.invitationLimit,
            renewalDiscountPercent: renewalDiscountPercent ?? basePkg.renewalDiscountPercent,
            description: description ?? basePkg.description,
            pricePaid: pricePaid ?? price ?? basePkg.price,
            discountPercent: discountPercent ?? 0,
            startDate: startDate ? new Date(startDate) : new Date(),
            reason: reason ?? null,
            notificationMessage,
        });

        const accountants = await User.find({ role: "Accountant" }).select("_id");
        try {
            await Promise.all(
                accountants.map((acct) =>
                    notifyPackageExceptionPending({
                        recipientId: acct._id,
                        member,
                        actorId: req.user.id,
                        requestId: request._id,
                        salesManagerName: proposer?.name,
                        packageName,
                        hasException: isException,
                        message: notificationMessage,
                    })
                )
            );
        } catch (notifyError) {
            // Request is already saved — don't fail the submit if notifications fail
            console.error("Failed to notify accountants of package request:", notifyError.message);
        }

        const populated = await PackageExceptionRequest.findById(request._id)
            .populate("member", "name systemId memberId")
            .populate("basePackage", "name duration price")
            .populate("proposedBy", "name email");

        await writeAudit({
            action: "package_exception_created",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "package_exception",
            targetId: request._id,
            meta: { memberId: member._id, hasException: isException },
            req,
        });

        res.status(201).json({ message: "Package exception submitted for approval", request: populated });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Accountant approves or rejects — atomic pending→final to prevent double-approve races
const updateExceptionStatus = async (req, res) => {
    try {
        const { status, reviewNote } = req.body;

        const request = await PackageExceptionRequest.findOneAndUpdate(
            { _id: req.params.id, status: "pending" },
            {
                $set: {
                    status,
                    reviewedBy: req.user.id,
                    reviewNote: reviewNote ?? null,
                },
            },
            { new: true }
        ).populate("member", "name");

        if (!request) {
            return res.status(409).json({
                message: "Request not found or already processed",
            });
        }

        if (status === "accepted") {
            try {
                await applyApprovedException(request, req.user.id);
            } catch (applyError) {
                // Revert so the accountant can retry after the underlying issue is fixed
                await PackageExceptionRequest.findByIdAndUpdate(request._id, {
                    $set: { status: "pending", reviewedBy: null, reviewNote: null },
                });
                throw applyError;
            }
        }

        await writeAudit({
            action: status === "accepted" ? "package_exception_accepted" : "package_exception_rejected",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "package_exception",
            targetId: request._id,
            meta: { memberId: request.member?._id || request.member, reviewNote: reviewNote ?? null },
            req,
        });

        await notifyPackageExceptionResolved({
            recipientId: request.proposedBy,
            member: request.member,
            actorId: req.user.id,
            status,
            requestId: request._id,
        });

        res.json({ message: `Package exception ${status}`, request });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// List exceptions — Accountant only
const getExceptions = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const filter = {};
        if (req.query.status && req.query.status !== "all") {
            if (req.query.status === "resolved") {
                filter.status = { $ne: "pending" };
            } else {
                filter.status = req.query.status;
            }
        }

        const [total, requests] = await Promise.all([
            PackageExceptionRequest.countDocuments(filter),
            PackageExceptionRequest.find(filter)
                .populate("member", "name systemId memberId status")
                .populate("basePackage", "name duration price activityType")
                .populate("proposedBy", "name email")
                .populate("reviewedBy", "name")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
        ]);

        res.json({
            requests,
            pagination: buildPagination(page, limit, total),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Pending exception for a specific member (shown on profile Packages tab)
const getMemberPendingException = async (req, res) => {
    try {
        const member = await findMemberByIdentifier(req.params.memberId);
        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        const request = await PackageExceptionRequest.findOne({
            member: member._id,
            status: "pending",
        })
            .populate("basePackage", "name duration price activityType freezeLimitDays invitationLimit renewalDiscountPercent")
            .populate("proposedBy", "name email role");

        res.json({ request: request ?? null });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    createException,
    updateExceptionStatus,
    getExceptions,
    getMemberPendingException,
};
