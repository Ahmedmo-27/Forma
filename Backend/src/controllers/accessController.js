const User = require("../models/User");
const Tenant = require("../models/Tenant");
const { getEffectiveFeatures } = require("../models/Tenant");
const { writeAudit } = require("../utils/audit");
const { runAsPlatform } = require("../context/tenantContext");
const {
    canEditTarget,
    groupFeaturesFor,
    directoryRolesFor,
    diffConfirmedFeatures,
    syncLegacyFields,
    effectiveAreas,
    roleDefaults,
} = require("../utils/accessControl");
const { normalizeAreas, areasWithinActor, AREAS } = require("../config/roleAccess");

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const searchUsersForAccess = async (req, res) => {
    try {
        req.user.areas = await actorAreas(req);
        const roles = directoryRolesFor(req.user);
        if (!roles.length) return res.status(403).json({ message: "Not authorized" });

        const role = String(req.query.role || "").trim();
        if (role) {
            if (!roles.includes(role)) return res.status(403).json({ message: "Not authorized" });
            const users = await User.find({ role, _id: { $ne: req.user.id } })
                .select("name role")
                .sort({ name: 1 })
                .limit(200);
            return res.json({
                users: users.map((user) => ({ _id: user._id, name: user.name, role: user.role })),
            });
        }

        const q = String(req.query.q || "").trim();
        if (q.length < 1) return res.json({ users: [] });

        const regex = new RegExp(escapeRegex(q), "i");
        const users = await User.find({
            role: { $in: roles },
            _id: { $ne: req.user.id },
            $or: [{ name: regex }, { email: regex }],
        })
            .select("name role")
            .sort({ name: 1 })
            .limit(8);

        res.json({
            users: users.map((user) => ({
                _id: user._id,
                name: user.name,
                role: user.role,
            })),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getUserAccess = async (req, res) => {
    try {
        req.user.areas = await actorAreas(req);
        const context = await accessContextForReq(req);
        const user = await User.findById(req.params.id).select("name email role abilities canViewPhones featureAccess accessOverrides");
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!canEditTarget(req.user, user)) {
            return res.status(403).json({ message: "You cannot edit this user's access" });
        }

        res.json({
            user: { _id: user._id, name: user.name, role: user.role },
            groups: groupFeaturesFor(req.user, user, context),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateUserAccess = async (req, res) => {
    try {
        const { features } = req.body || {};
        if (!Array.isArray(features) || features.some((key) => typeof key !== "string")) {
            return res.status(400).json({ message: "features must be an array of feature keys" });
        }
        req.user.areas = await actorAreas(req);
        const context = await accessContextForReq(req);

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!canEditTarget(req.user, user)) {
            return res.status(403).json({ message: "You cannot edit this user's access" });
        }

        const diff = diffConfirmedFeatures(req.user, user, features, context);
        if (diff.error) return res.status(400).json({ message: diff.error });

        user.featureAccess = { grants: diff.grants, revokes: diff.revokes };
        user.markModified("featureAccess");
        syncLegacyFields(user);
        await user.save();

        await writeAudit({
            action: "access_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { grants: diff.grants, revokes: diff.revokes, role: user.role },
            req,
        });

        res.json({
            message: "Access updated",
            user: { _id: user._id, name: user.name, role: user.role },
            groups: groupFeaturesFor(req.user, user, context),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

async function getTenantWithPlan(req) {
    let tenant = req.tenant;
    if (!tenant && req.user?.tenantId) {
        tenant = await runAsPlatform(async () => {
            return await Tenant.findById(req.user.tenantId).populate("planId");
        });
    } else if (tenant && (!tenant.planId || !tenant.planId.features) && tenant.planId) {
        tenant = await runAsPlatform(async () => {
            return await Tenant.findById(tenant._id || tenant.id).populate("planId");
        });
    }
    return tenant;
}

async function accessContextForReq(req) {
    const tenant = await getTenantWithPlan(req);
    const plan = tenant?.planId?.features ? tenant.planId : null;
    return {
        roleAccess: tenant?.roleAccess || null,
        planFeatures: plan ? getEffectiveFeatures(tenant, plan) : null,
    };
}

async function actorAreas(req) {
    const tenant = await getTenantWithPlan(req);
    const context = await accessContextForReq(req);
    const saved = savedAreasFor(tenant?.roleAccess, req.user?.role);
    if (saved && saved.includes("staff")) {
        req.user.hasStaffAccess = true;
    }
    return effectiveAreas(req.user, context);
}

const updateUserAreaAccess = async (req, res) => {
    try {
        const parsed = normalizeAreas([...(req.body?.add || []), ...(req.body?.remove || [])]);
        if (!Array.isArray(req.body?.add) || !Array.isArray(req.body?.remove)) {
            return res.status(400).json({ message: "add and remove must be arrays of area keys" });
        }
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        req.user.areas = await actorAreas(req);
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!canEditTarget(req.user, user)) {
            return res.status(403).json({ message: "You cannot edit this user's access" });
        }
        if (req.user.role !== "Owner" && (user.role === "Owner" || user.role === "General Manager")) {
            return res.status(403).json({ message: "You cannot edit this user's access" });
        }

        const addParsed = normalizeAreas(req.body.add);
        const removeParsed = normalizeAreas(req.body.remove);
        if (addParsed.error) return res.status(400).json({ message: addParsed.error });
        if (removeParsed.error) return res.status(400).json({ message: removeParsed.error });

        if (req.user.role !== "Owner") {
            const mine = await actorAreas(req);
            const limited = areasWithinActor(addParsed.areas, mine);
            if (limited.error) return res.status(403).json({ message: limited.error });
        }

        user.accessOverrides = { add: addParsed.areas, remove: removeParsed.areas };
        user.markModified("accessOverrides");
        await user.save();

        await writeAudit({
            action: "user_area_access_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "user",
            targetId: user._id,
            meta: { add: addParsed.areas, remove: removeParsed.areas, role: user.role },
            req,
        });

        res.json({
            message: "Access updated",
            user: { _id: user._id, role: user.role },
            accessOverrides: user.accessOverrides,
            defaults: roleDefaults(user.role),
            catalog: AREAS,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    searchUsersForAccess,
    getUserAccess,
    updateUserAccess,
    updateUserAreaAccess,
};
