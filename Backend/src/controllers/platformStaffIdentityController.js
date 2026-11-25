const CrossTenantStaffRequest = require("../models/CrossTenantStaffRequest");
const User = require("../models/User");
const { runAsPlatform } = require("../context/tenantContext");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { writePlatformAudit } = require("../utils/audit");
const { escapeRegex } = require("../utils/username");
const { serialize } = require("./staffIdentityRequestController");
const {
    upsertMembership,
    transferHomeTenant,
    ensureHomeMembership,
} = require("../utils/staffMembership");
const { bumpTokenVersion } = require("../utils/passwordUtils");
const { invalidateAuthContext } = require("../middleware/authContextCache");

async function listStaffIdentityRequests(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const { status = "pending", tenantId, search } = req.query || {};

        const filter = {};
        if (status && status !== "all") filter.status = status;
        if (tenantId) {
            filter.$or = [
                { requestingTenantId: tenantId },
                { sourceTenantId: tenantId },
            ];
        }
        if (search && String(search).trim()) {
            const regex = new RegExp(escapeRegex(String(search).trim()), "i");
            const searchClause = [
                { requestingTenantName: regex },
                { requestingTenantSlug: regex },
                { sourceTenantName: regex },
                { sourceUserName: regex },
                { sourceUserEmail: regex },
                { proposedName: regex },
                { proposedEmail: regex },
            ];
            if (filter.$or) {
                filter.$and = [{ $or: filter.$or }, { $or: searchClause }];
                delete filter.$or;
            } else {
                filter.$or = searchClause;
            }
        }

        const [rows, total] = await Promise.all([
            CrossTenantStaffRequest.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CrossTenantStaffRequest.countDocuments(filter),
        ]);

        return res.json({
            requests: rows.map(serialize),
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function loadPending(id) {
    const doc = await CrossTenantStaffRequest.findById(id);
    if (!doc) return { error: { status: 404, message: "Request not found" } };
    if (doc.status !== "pending") {
        return {
            error: {
                status: 400,
                code: "REQUEST_NOT_PENDING",
                message: "Only pending requests can be decided.",
            },
        };
    }
    return { doc };
}

function applyDecisionMeta(doc, req, status) {
    doc.status = status;
    doc.adminNote = typeof req.body?.note === "string" ? req.body.note.trim() : doc.adminNote;
    doc.decidedByPlatformUserId = req.platformUser?.id || req.platformUser?._id || null;
    doc.decidedAt = new Date();
}

/**
 * POST /api/platform/staff-identity-requests/:id/dual
 * Keep staff at source gym and add membership at requesting gym.
 */
async function approveDual(req, res) {
    return runAsPlatform(async () => {
        try {
            const loaded = await loadPending(req.params.id);
            if (loaded.error) {
                return res.status(loaded.error.status).json(loaded.error);
            }
            const doc = loaded.doc;

            const user = await User.findById(doc.sourceUserId);
            if (!user) {
                return res.status(404).json({ message: "Source staff user not found" });
            }

            ensureHomeMembership(user);
            upsertMembership(user, {
                tenantId: doc.requestingTenantId,
                role: doc.proposedRole,
                canAccessAllLocations: Boolean(doc.proposedCanAccessAllLocations),
                allowedLocationIds: doc.proposedAllowedLocationIds || [],
                status: "active",
            });
            await user.save();

            applyDecisionMeta(doc, req, "approved_dual");
            await doc.save();

            invalidateAuthContext({ userId: String(user._id) });

            await writePlatformAudit({
                tenantId: doc.requestingTenantId,
                action: "staff_identity.approve_dual",
                actorPlatformUserId: req.platformUser?.id,
                targetType: "user",
                targetId: user._id,
                meta: {
                    requestId: String(doc._id),
                    sourceTenantId: String(doc.sourceTenantId),
                    role: doc.proposedRole,
                },
                req,
            });

            return res.json({
                message: "Staff granted access to both gyms",
                request: serialize(doc),
            });
        } catch (err) {
            return res.status(500).json({ message: "Server error", error: err.message });
        }
    }, { reason: "platform staff identity dual" });
}

/**
 * POST /api/platform/staff-identity-requests/:id/transfer
 * Move the staff identity to the requesting gym; drop other gym data links on the User.
 */
async function approveTransfer(req, res) {
    return runAsPlatform(async () => {
        try {
            const loaded = await loadPending(req.params.id);
            if (loaded.error) {
                return res.status(loaded.error.status).json(loaded.error);
            }
            const doc = loaded.doc;

            const user = await User.findById(doc.sourceUserId);
            if (!user) {
                return res.status(404).json({ message: "Source staff user not found" });
            }

            const previousTenantId = user.tenantId;
            transferHomeTenant(user, {
                tenantId: doc.requestingTenantId,
                role: doc.proposedRole,
                canAccessAllLocations: Boolean(doc.proposedCanAccessAllLocations),
                allowedLocationIds: doc.proposedAllowedLocationIds || [],
            });
            if (doc.proposedName) user.name = doc.proposedName;
            // Keep email, phone, password; bump sessions so old gym JWTs die.
            if (typeof bumpTokenVersion === "function") {
                bumpTokenVersion(user);
            } else {
                user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
            }
            await user.save();

            applyDecisionMeta(doc, req, "approved_transfer");
            await doc.save();

            invalidateAuthContext({ userId: String(user._id) });

            await writePlatformAudit({
                tenantId: doc.requestingTenantId,
                action: "staff_identity.approve_transfer",
                actorPlatformUserId: req.platformUser?.id,
                targetType: "user",
                targetId: user._id,
                meta: {
                    requestId: String(doc._id),
                    previousTenantId: previousTenantId ? String(previousTenantId) : null,
                    role: doc.proposedRole,
                },
                req,
            });

            return res.json({
                message: "Staff transferred to requesting gym",
                request: serialize(doc),
            });
        } catch (err) {
            return res.status(500).json({ message: "Server error", error: err.message });
        }
    }, { reason: "platform staff identity transfer" });
}

/**
 * POST /api/platform/staff-identity-requests/:id/reject
 */
async function rejectStaffIdentity(req, res) {
    return runAsPlatform(async () => {
        try {
            const loaded = await loadPending(req.params.id);
            if (loaded.error) {
                return res.status(loaded.error.status).json(loaded.error);
            }
            const doc = loaded.doc;
            applyDecisionMeta(doc, req, "rejected");
            await doc.save();

            await writePlatformAudit({
                tenantId: doc.requestingTenantId,
                action: "staff_identity.reject",
                actorPlatformUserId: req.platformUser?.id,
                targetType: "user",
                targetId: doc.sourceUserId,
                meta: { requestId: String(doc._id) },
                req,
            });

            return res.json({
                message: "Request rejected",
                request: serialize(doc),
            });
        } catch (err) {
            return res.status(500).json({ message: "Server error", error: err.message });
        }
    }, { reason: "platform staff identity reject" });
}

module.exports = {
    listStaffIdentityRequests,
    approveDual,
    approveTransfer,
    rejectStaffIdentity,
};
