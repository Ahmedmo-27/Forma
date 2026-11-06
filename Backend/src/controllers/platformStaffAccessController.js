const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");
const { groupFeaturesFor, diffConfirmedFeatures, syncLegacyFields } = require("../utils/accessControl");

function isObjectId(value) {
    if (!mongoose.Types.ObjectId.isValid(value)) return false;
    return String(new mongoose.Types.ObjectId(value)) === String(value);
}

function platformActor(req) {
    return { role: "Owner", id: `platform:${req.platformUser.id}` };
}

async function findTenant(id) {
    if (!isObjectId(id)) return null;
    return Tenant.findById(id).select("ownerUserId");
}

async function findStaff(tenantId, userId) {
    if (!isObjectId(userId)) return null;
    return User.findOne({ _id: userId, tenantId }).select("name email role abilities canViewPhones featureAccess");
}

/**
 * GET /api/platform/tenants/:id/staff
 * Every gym user, including the owner.
 */
const listTenantStaff = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const ownerId = tenant.ownerUserId ? String(tenant.ownerUserId) : "";
        const users = await User.find({ tenantId: tenant._id })
            .select("name email role")
            .sort({ name: 1 });

        res.json({
            users: users.map((user) => ({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isPrimaryOwner: String(user._id) === ownerId,
            })),
        });
    } catch (error) {
        logger.error("platform", "listTenantStaff failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * GET /api/platform/tenants/:id/staff/:userId/access
 */
const getTenantStaffAccess = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const user = await findStaff(tenant._id, req.params.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({
            user: { _id: user._id, name: user.name, role: user.role },
            groups: groupFeaturesFor(platformActor(req), user),
        });
    } catch (error) {
        logger.error("platform", "getTenantStaffAccess failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PUT /api/platform/tenants/:id/staff/:userId/access
 * Body: { features: string[] } enabled feature keys.
 */
const updateTenantStaffAccess = async (req, res) => {
    try {
        const { features } = req.body || {};
        if (!Array.isArray(features) || features.some((key) => typeof key !== "string")) {
            return res.status(400).json({ message: "features must be an array of feature keys" });
        }

        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const user = await findStaff(tenant._id, req.params.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const actor = platformActor(req);
        const diff = diffConfirmedFeatures(actor, user, features);
        if (diff.error) return res.status(400).json({ message: diff.error });

        user.featureAccess = { grants: diff.grants, revokes: diff.revokes };
        if (typeof user.markModified === "function") user.markModified("featureAccess");
        syncLegacyFields(user);
        await user.save();

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_staff_access_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: String(user._id),
            meta: {
                grants: diff.grants,
                revokes: diff.revokes,
                role: user.role,
                actorEmail: req.platformUser.email,
            },
        });

        res.json({
            message: "Access updated",
            user: { _id: user._id, name: user.name, role: user.role },
            groups: groupFeaturesFor(actor, user),
        });
    } catch (error) {
        logger.error("platform", "updateTenantStaffAccess failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    listTenantStaff,
    getTenantStaffAccess,
    updateTenantStaffAccess,
};
