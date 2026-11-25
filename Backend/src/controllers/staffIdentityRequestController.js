const CrossTenantStaffRequest = require("../models/CrossTenantStaffRequest");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const { runAsPlatform } = require("../context/tenantContext");
const { writeAudit } = require("../utils/audit");
const { normalizeEmail } = require("../utils/passwordUtils");
const { normalizePhone } = require("../utils/identityUniqueness");
const { assignableRolesFor } = require("../utils/accessControl");

function serialize(doc) {
    const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
    return {
        id: String(plain._id),
        sourceUserId: plain.sourceUserId ? String(plain.sourceUserId) : null,
        sourceTenantId: plain.sourceTenantId ? String(plain.sourceTenantId) : null,
        sourceTenantName: plain.sourceTenantName || "",
        sourceTenantSlug: plain.sourceTenantSlug || "",
        sourceUserName: plain.sourceUserName || "",
        requestingTenantId: plain.requestingTenantId ? String(plain.requestingTenantId) : null,
        requestingTenantName: plain.requestingTenantName || "",
        requestingTenantSlug: plain.requestingTenantSlug || "",
        proposedName: plain.proposedName || "",
        proposedEmail: plain.proposedEmail || "",
        proposedPhone: plain.proposedPhone || "",
        proposedRole: plain.proposedRole || "",
        conflictField: plain.conflictField || "phone",
        status: plain.status,
        adminNote: plain.adminNote || "",
        decidedAt: plain.decidedAt,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
    };
}

/**
 * POST /api/staff-identity-requests
 * Body: { sourceUserId, name, email, mobile_number, role, canAccessAllLocations?, allowedLocationIds? }
 */
async function createStaffIdentityRequest(req, res) {
    try {
        const creatable = assignableRolesFor(req.user);
        if (!creatable.length) {
            return res.status(403).json({ message: "Not authorized to request staff access" });
        }

        const {
            sourceUserId,
            name,
            email,
            mobile_number,
            role,
            canAccessAllLocations,
            allowedLocationIds,
        } = req.body || {};

        if (!sourceUserId || !role) {
            return res.status(400).json({ message: "sourceUserId and role are required" });
        }
        if (!creatable.includes(role)) {
            return res.status(400).json({ message: "You cannot request that role" });
        }

        const requestingTenantId = req.user.tenantId;
        const sourceUser = await runAsPlatform(
            () => User.findById(sourceUserId)
                .select("name email mobile_number phoneKey tenantId memberships role"),
            { reason: "staff identity request source lookup" }
        );
        if (!sourceUser) {
            return res.status(404).json({ message: "Source staff user not found" });
        }
        if (String(sourceUser.tenantId) === String(requestingTenantId)) {
            return res.status(400).json({ message: "That staff member already belongs to this gym" });
        }

        const { hasActiveMembership } = require("../utils/staffMembership");
        if (hasActiveMembership(sourceUser, requestingTenantId)) {
            return res.status(400).json({ message: "That staff member already has access to this gym" });
        }

        const [sourceTenant, requestingTenant] = await runAsPlatform(
            () => Promise.all([
                Tenant.findById(sourceUser.tenantId).select("name slug"),
                Tenant.findById(requestingTenantId).select("name slug"),
            ]),
            { reason: "staff identity request tenant snapshots" }
        );

        const existingPending = await runAsPlatform(
            () => CrossTenantStaffRequest.findOne({
                sourceUserId: sourceUser._id,
                requestingTenantId,
                status: "pending",
            }),
            { reason: "staff identity request idempotent lookup" }
        );
        if (existingPending) {
            return res.status(200).json({
                message: "A pending request already exists",
                request: serialize(existingPending),
            });
        }

        const phoneKey = normalizePhone(mobile_number || sourceUser.mobile_number || sourceUser.phoneKey);
        const normalizedEmail = normalizeEmail(email || sourceUser.email);
        let conflictField = "phone";
        if (
            phoneKey
            && sourceUser.phoneKey
            && phoneKey === sourceUser.phoneKey
            && normalizedEmail
            && normalizeEmail(sourceUser.email) === normalizedEmail
        ) {
            conflictField = "both";
        } else if (normalizedEmail && normalizeEmail(sourceUser.email) === normalizedEmail) {
            conflictField = "email";
        }

        const doc = await runAsPlatform(
            () => CrossTenantStaffRequest.create({
                sourceUserId: sourceUser._id,
                sourceTenantId: sourceUser.tenantId,
                sourceTenantName: sourceTenant?.name || "",
                sourceTenantSlug: sourceTenant?.slug || "",
                sourceUserName: sourceUser.name || "",
                sourceUserEmail: sourceUser.email || "",
                sourceUserPhone: sourceUser.mobile_number || "",
                requestingTenantId,
                requestingTenantName: requestingTenant?.name || "",
                requestingTenantSlug: requestingTenant?.slug || "",
                requestedByUserId: req.user.id,
                requestedByName: req.user.name || "",
                requestedByRole: req.user.role || "",
                proposedName: String(name || sourceUser.name || "").trim(),
                proposedEmail: normalizedEmail || sourceUser.email || "",
                proposedPhone: String(mobile_number || sourceUser.mobile_number || "").trim(),
                proposedRole: role,
                proposedCanAccessAllLocations: Boolean(canAccessAllLocations),
                proposedAllowedLocationIds: Array.isArray(allowedLocationIds) ? allowedLocationIds : [],
                conflictField,
                status: "pending",
            }),
            { reason: "create staff identity request" }
        );

        await writeAudit({
            action: "staff_identity.request",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: sourceUser._id,
            meta: {
                requestId: String(doc._id),
                sourceTenantId: String(sourceUser.tenantId),
                proposedRole: role,
            },
            req,
        });

        return res.status(201).json({
            message: "Request sent to Super Admin",
            request: serialize(doc),
        });
    } catch (error) {
        if (error?.code === 11000) {
            const existing = await runAsPlatform(
                () => CrossTenantStaffRequest.findOne({
                    sourceUserId: req.body?.sourceUserId,
                    requestingTenantId: req.user.tenantId,
                    status: "pending",
                }),
                { reason: "staff identity duplicate pending" }
            );
            if (existing) {
                return res.status(200).json({
                    message: "A pending request already exists",
                    request: serialize(existing),
                });
            }
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
}

/**
 * GET /api/staff-identity-requests/mine
 */
async function listMine(req, res) {
    try {
        if (!["Owner", "General Manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized" });
        }
        const requests = await runAsPlatform(
            () => CrossTenantStaffRequest.find({ requestingTenantId: req.user.tenantId })
                .sort({ createdAt: -1 })
                .limit(50)
                .lean(),
            { reason: "list staff identity requests mine" }
        );
        return res.json({ requests: requests.map(serialize) });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
}

module.exports = {
    createStaffIdentityRequest,
    listMine,
    serialize,
};
