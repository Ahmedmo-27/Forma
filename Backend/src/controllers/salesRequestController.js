const SalesRepRequest = require("../models/SalesRepRequest");
const Member = require("../models/Member");
const User = require("../models/User");
const { hasAccess } = require("../utils/accessControl");
const { buildMemberFilter, findMemberByIdentifier } = require("../utils/memberLookup");
const { notifyMemberAssigned, notifySalesRepRequestPending } = require("../utils/notificationService");
const { parsePagination, buildPagination } = require("../utils/pagination");

// Submit a request to assign a member to the logged-in sales rep
const createRequest = async (req, res) => {
    try {
        const { memberId } = req.body;
        if (!memberId) {
            return res.status(400).json({ message: "Member ID is required" });
        }

        const member = await findMemberByIdentifier(memberId);
        if (!member) {
            const filter = buildMemberFilter(memberId);
            if (!filter) {
                return res.status(400).json({ message: "Invalid member ID" });
            }
            return res.status(404).json({ message: "Member not found" });
        }

        const { forbidIfOutOfLocationScope } = require("../utils/locationScope");
        const forbidden = forbidIfOutOfLocationScope(req, member);
        if (forbidden) {
            return res.status(forbidden.status).json({ code: forbidden.code, message: forbidden.message });
        }

        const resolvedMemberId = member._id;

        const isTakeover = Boolean(member.assignedSales);

        if (isTakeover && !hasAccess(req.user, "request_takeover")) {
            return res.status(403).json({ message: "You are not allowed to request replacing another representative" });
        }

        if (!isTakeover && !hasAccess(req.user, "request_assignment")) {
            return res.status(403).json({ message: "You are not allowed to request acquiring new members" });
        }

        // Prevent requesting members already assigned to the requester
        if (member.assignedSales && member.assignedSales.toString() === req.user.id) {
            return res.status(400).json({ message: "This member is already assigned to you" });
        }

        // Check if there is already a pending request
        const existingRequest = await SalesRepRequest.findOne({ member: resolvedMemberId, status: "pending" });
        if (existingRequest) {
            return res.status(400).json({ message: "There is already a pending request for this member" });
        }

        const newRequest = await SalesRepRequest.create({
            member: resolvedMemberId,
            requestedBy: req.user.id,
            status: "pending"
        });

        const salesManagers = await User.find({ role: "Sales Manager" }).select("_id");
        try {
            await Promise.all(
                salesManagers.map((manager) =>
                    notifySalesRepRequestPending({
                        recipientId: manager._id,
                        member,
                        actorId: req.user.id,
                        requestId: newRequest._id,
                        salesRepName: req.user.name,
                        isTakeover,
                    })
                )
            );
        } catch (notifyError) {
            // Request is already saved — don't fail the submit if notifications fail
            console.error("Failed to notify sales managers of assignment request:", notifyError.message);
        }

        res.status(201).json({ message: "Request submitted successfully", request: newRequest });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update request status (Approve/Reject)
const updateRequestStatus = async (req, res) => {
    try {
        const { status } = req.body;

        const request = await SalesRepRequest.findOneAndUpdate(
            { _id: req.params.id, status: "pending" },
            { $set: { status } },
            { new: true }
        );

        if (!request) {
            return res.status(409).json({ message: "Request not found or already processed" });
        }

        if (status === "accepted") {
            try {
                const member = await Member.findById(request.member);
                if (member) {
                    member.assignedSales = request.requestedBy;
                    member.userlog.push({
                        type: "assign",
                        text: "Assigned via approved sales request",
                        createdBy: req.user.id,
                    });
                    await member.save();
                    await notifyMemberAssigned({
                        recipientId: request.requestedBy,
                        member,
                        actorId: req.user.id,
                    });
                }
            } catch (applyError) {
                await SalesRepRequest.findByIdAndUpdate(request._id, { $set: { status: "pending" } });
                throw applyError;
            }
        }

        res.json({ message: `Request ${status} successfully`, request });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get requests
const getRequests = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        let filter = {};

        if (req.user.role === "Sales") {
            filter.requestedBy = req.user.id;
        }

        if (req.query.status && req.query.status !== "all") {
            if (req.query.status === "resolved") {
                filter.status = { $ne: "pending" };
            } else {
                filter.status = req.query.status;
            }
        }

        if (req.query.requestedBy) {
            filter.requestedBy = req.query.requestedBy;
        }

        const { memberIdsMatchingLocationFilter } = require("../utils/locationScope");
        const scopedMemberIds = await memberIdsMatchingLocationFilter(req.locationFilter, Member);
        if (scopedMemberIds) {
            filter.member = { $in: scopedMemberIds };
        }

        const [total, requests] = await Promise.all([
            SalesRepRequest.countDocuments(filter),
            SalesRepRequest.find(filter)
                .populate("member", "name systemId")
                .populate("requestedBy", "name email")
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

module.exports = {
    createRequest,
    updateRequestStatus,
    getRequests
};
