const PlatformUser = require("../models/PlatformUser");
const AuditLog = require("../models/AuditLog");
const { hashPassword, normalizeEmail } = require("../utils/passwordUtils");
const { parsePagination, buildPagination } = require("../utils/pagination");

/**
 * List all Platform Users with Server-Side Pagination, Filtering and Search
 * GET /api/platform/users
 */
async function getPlatformUsers(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const { role, status, search } = req.query || {};

        const filter = {};
        if (role) filter.role = role;
        if (status) filter.status = status;
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            filter.$or = [{ name: regex }, { email: regex }];
        }

        const [users, total] = await Promise.all([
            PlatformUser.find(filter)
                .select("-password -mfa.secretEncrypted -mfa.recoveryCodesHashed")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            PlatformUser.countDocuments(filter),
        ]);

        res.json({
            users,
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Create a new Platform User
 * POST /api/platform/users
 */
async function createPlatformUser(req, res) {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: "Name, email, password, and role are required" });
        }

        if (!["super_admin", "billing", "support", "analyst"].includes(role)) {
            return res.status(400).json({ message: "Invalid platform role specified" });
        }

        const normalized = normalizeEmail(email);
        const existing = await PlatformUser.findOne({ email: normalized });
        if (existing) {
            return res.status(400).json({ message: "Platform user with this email already exists" });
        }

        const passwordHash = await hashPassword(password);
        const user = await PlatformUser.create({
            name: name.trim(),
            email: normalized,
            password: passwordHash,
            role,
            status: "active",
        });

        await AuditLog.create({
            action: "staff_created",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: user._id.toString(),
            meta: {
                createdUserEmail: user.email,
                role: user.role,
                createdBy: req.platformUser.email,
                reason: req.body.reason || "Platform user created",
            },
        });

        res.status(201).json({
            message: "Platform user created successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Update Platform User (Role / Status)
 * PATCH /api/platform/users/:id
 */
async function updatePlatformUser(req, res) {
    try {
        const { id } = req.params;
        const { role, status, reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: "Mandatory 'reason' field is required for platform user modifications" });
        }

        const user = await PlatformUser.findById(id);
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        // Guard: Prevent demoting or disabling the last active super_admin
        if ((role && role !== "super_admin") || (status && status === "disabled")) {
            if (user.role === "super_admin" && user.status === "active") {
                const superAdminCount = await PlatformUser.countDocuments({
                    role: "super_admin",
                    status: "active",
                });
                if (superAdminCount <= 1) {
                    return res.status(400).json({
                        message: "Operation rejected: cannot demote or disable the last active super_admin",
                    });
                }
            }
        }

        const beforeState = { role: user.role, status: user.status };
        if (role) user.role = role;
        if (status) user.status = status;
        await user.save();

        await AuditLog.create({
            action: "sales_abilities_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: user._id.toString(),
            meta: {
                modifiedUserId: user._id.toString(),
                beforeState,
                afterState: { role: user.role, status: user.status },
                reason,
            },
        });

        res.json({
            message: "Platform user updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Delete Platform User
 * DELETE /api/platform/users/:id
 */
async function deletePlatformUser(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body || {};

        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: "Mandatory 'reason' field is required for user deletion" });
        }

        const user = await PlatformUser.findById(id);
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        if (user.role === "super_admin") {
            const superAdminCount = await PlatformUser.countDocuments({
                role: "super_admin",
                status: "active",
            });
            if (superAdminCount <= 1) {
                return res.status(400).json({
                    message: "Operation rejected: cannot delete the last active super_admin",
                });
            }
        }

        await PlatformUser.findByIdAndDelete(id);

        await AuditLog.create({
            action: "staff_created",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: id,
            meta: {
                deletedUserEmail: user.email,
                deletedUserRole: user.role,
                reason,
            },
        });

        res.json({ message: "Platform user deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Reset MFA for a Platform User
 * POST /api/platform/users/:id/reset-mfa
 */
async function resetUserMfa(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: "Mandatory 'reason' field required to reset MFA" });
        }

        const user = await PlatformUser.findById(id);
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        user.mfa = {
            enabled: false,
            secretEncrypted: null,
            recoveryCodesHashed: [],
            enrolledAt: null,
        };
        // Revoke existing sessions upon MFA reset
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        await AuditLog.create({
            action: "phone_privacy_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: user._id.toString(),
            meta: {
                action: "mfa_reset",
                targetUserEmail: user.email,
                reason,
            },
        });

        res.json({ message: `MFA reset successfully for ${user.email}. User must re-enroll on next sign in.` });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Revoke All Active Sessions for a Platform User
 * POST /api/platform/users/:id/revoke-sessions
 */
async function revokeUserSessions(req, res) {
    try {
        const { id } = req.params;
        const user = await PlatformUser.findById(id);
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ message: `All active sessions revoked for ${user.email}` });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getPlatformUsers,
    createPlatformUser,
    updatePlatformUser,
    deletePlatformUser,
    resetUserMfa,
    revokeUserSessions,
};
