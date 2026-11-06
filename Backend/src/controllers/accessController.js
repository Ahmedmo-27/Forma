const User = require("../models/User");
const { writeAudit } = require("../utils/audit");
const {
    canEditTarget,
    groupFeaturesFor,
    editableRolesFor,
    diffConfirmedFeatures,
    syncLegacyFields,
} = require("../utils/accessControl");

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const searchUsersForAccess = async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 1) return res.json({ users: [] });

        const roles = editableRolesFor(req.user.role);
        if (!roles.length) return res.status(403).json({ message: "Not authorized" });

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
        const user = await User.findById(req.params.id).select("name email role abilities canViewPhones featureAccess");
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!canEditTarget(req.user, user)) {
            return res.status(403).json({ message: "You cannot edit this user's access" });
        }

        res.json({
            user: { _id: user._id, name: user.name, role: user.role },
            groups: groupFeaturesFor(req.user, user),
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

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!canEditTarget(req.user, user)) {
            return res.status(403).json({ message: "You cannot edit this user's access" });
        }

        const diff = diffConfirmedFeatures(req.user, user, features);
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
            groups: groupFeaturesFor(req.user, user),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    searchUsersForAccess,
    getUserAccess,
    updateUserAccess,
};
