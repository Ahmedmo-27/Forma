const crypto = require("crypto");
const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");
const { groupFeaturesFor, diffConfirmedFeatures, syncLegacyFields } = require("../utils/accessControl");
const passwordUtils = require("../utils/passwordUtils");
const identityUniqueness = require("../utils/identityUniqueness");
const { invalidateAuthContext } = require("../middleware/authContextCache");
const passwordSetup = require("../services/passwordSetupService");
const { runWithTenant } = require("../context/tenantContext");
const { resolveUsername } = require("../utils/username");
const {
    applyLocationAccessToUser,
    defaultLocationFieldsForRole,
} = require("../utils/userLocationAccess");
const { toIdStrings, userHasAllLocations } = require("../utils/locationScope");
const mailer = require("../services/mailer");

const GYM_ROLES = [
    "Owner",
    "General Manager",
    "Receptionist",
    "Coach",
    "Head Coach",
    "Accountant",
    "Sales",
    "Sales Manager",
];

const CREATABLE_ROLES = GYM_ROLES.filter((role) => role !== "Owner");

function isObjectId(value) {
    if (!mongoose.Types.ObjectId.isValid(value)) return false;
    return String(new mongoose.Types.ObjectId(value)) === String(value);
}

function platformActor(req) {
    return { role: "Owner", id: `platform:${req.platformUser.id}` };
}

function serializeStaff(user, ownerId) {
    const canAccessAll = userHasAllLocations(user);
    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username || "",
        mobile_number: user.mobile_number || "",
        role: user.role,
        isPrimaryOwner: ownerId ? String(user._id) === String(ownerId) : false,
        canAccessAllLocations: canAccessAll,
        allowedLocationIds: canAccessAll ? [] : toIdStrings(user.allowedLocationIds),
    };
}

async function findTenant(id) {
    if (!isObjectId(id)) return null;
    return Tenant.findById(id)
        .select("ownerUserId roleAccess planId featureOverrides billing slug limitOverrides name")
        .populate("planId");
}

/**
 * The same plan and role-access context a gym owner sees, so a platform editor
 * greys out areas the gym's plan has switched off and diffs against real defaults.
 */
function accessContextFor(tenant) {
    const plan = tenant?.planId?.features ? tenant.planId : null;
    return {
        roleAccess: tenant?.roleAccess || null,
        planFeatures: plan ? getEffectiveFeatures(tenant, plan) : null,
    };
}

async function findStaff(tenantId, userId) {
    if (!isObjectId(userId)) return null;
    return User.findOne({ _id: userId, tenantId }).select(
        "name email username mobile_number role abilities canViewPhones featureAccess accessOverrides password tokenVersion allowedLocationIds canAccessAllLocations phoneKey"
    );
}

function staffQuotaSnapshot(tenant, staffCount) {
    const plan = tenant?.planId?.limits || tenant?.planId?.features ? tenant.planId : null;
    const limits = getEffectiveLimits(tenant, plan);
    const maxStaff = limits.maxStaff != null ? limits.maxStaff : 10;
    const overStaffQuota = maxStaff > 0 && staffCount > maxStaff;
    return {
        current: staffCount,
        max: maxStaff,
        overStaffQuota,
        staffQuotaWarning: overStaffQuota
            ? `This gym is over its allowed staff quota (${staffCount}/${maxStaff}).`
            : null,
    };
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
            .select("name email username mobile_number role allowedLocationIds canAccessAllLocations")
            .sort({ name: 1 });

        const quota = staffQuotaSnapshot(tenant, users.length);
        res.json({
            users: users.map((user) => serializeStaff(user, ownerId)),
            overStaffQuota: quota.overStaffQuota,
            staffQuotaWarning: quota.staffQuotaWarning,
            staffQuota: { current: quota.current, max: quota.max },
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
            user: serializeStaff(user, tenant.ownerUserId),
            groups: groupFeaturesFor(platformActor(req), user, accessContextFor(tenant)),
        });
    } catch (error) {
        logger.error("platform", "getTenantStaffAccess failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/platform/tenants/:id/staff
 * Body: name, email, mobile_number, role; optional username, password, location grants.
 * Without password → invite token (same flow as tenant onboard).
 */
const createTenantStaff = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const {
            name,
            email,
            mobile_number,
            role,
            username: rawUsername,
            password,
            canAccessAllLocations,
            allowedLocationIds,
        } = req.body || {};

        const nextName = String(name || "").trim();
        if (!nextName) return res.status(400).json({ message: "name is required" });
        if (nextName.length > 120) return res.status(400).json({ message: "name must not exceed 120 characters" });

        const normalizedEmail = passwordUtils.normalizeEmail(email);
        if (!normalizedEmail) return res.status(400).json({ message: "email is required" });

        const nextMobile = String(mobile_number || "").trim();
        if (!nextMobile) return res.status(400).json({ message: "mobile_number is required" });

        if (!CREATABLE_ROLES.includes(role)) {
            return res.status(400).json({
                message: role === "Owner"
                    ? "Cannot create another Owner from platform. Transfer ownership first."
                    : "Invalid role",
            });
        }

        let useInvite = password === undefined || password === null || password === "";
        let passwordHash;
        if (!useInvite) {
            if (typeof password !== "string" || password.length < passwordUtils.MIN_PASSWORD_LENGTH) {
                return res.status(400).json({
                    message: `password must be at least ${passwordUtils.MIN_PASSWORD_LENGTH} characters`,
                });
            }
            if (password.length > 200) {
                return res.status(400).json({ message: "password must not exceed 200 characters" });
            }
            passwordHash = await passwordUtils.hashPassword(password);
        } else {
            const temporaryPassword = crypto.randomBytes(16).toString("hex") + "A1!";
            passwordHash = await passwordUtils.hashPassword(temporaryPassword);
        }

        await identityUniqueness.assertEmailAvailable(normalizedEmail);
        const phoneKey = await identityUniqueness.assertPhoneAvailable(nextMobile);

        const locationDefaults = defaultLocationFieldsForRole(role);
        const explicitLocation =
            canAccessAllLocations !== undefined || allowedLocationIds !== undefined;
        let locationPayload = explicitLocation
            ? {
                canAccessAllLocations: canAccessAllLocations !== undefined
                    ? Boolean(canAccessAllLocations)
                    : false,
                allowedLocationIds: Array.isArray(allowedLocationIds) ? allowedLocationIds : [],
            }
            : { ...locationDefaults };

        const actor = platformActor(req);

        const user = await runWithTenant(
            { tenantId: String(tenant._id), tenantSlug: tenant.slug },
            async () => {
                if (explicitLocation) {
                    const probe = {
                        role,
                        canAccessAllLocations: false,
                        allowedLocationIds: [],
                        markModified() {},
                    };
                    const grant = await applyLocationAccessToUser(
                        actor,
                        probe,
                        locationPayload,
                        { requireBranches: true }
                    );
                    if (grant?.error) {
                        const err = new Error(grant.error);
                        err.status = grant.status || 400;
                        throw err;
                    }
                    locationPayload.canAccessAllLocations = probe.canAccessAllLocations;
                    locationPayload.allowedLocationIds = probe.allowedLocationIds;
                }

                const username = await resolveUsername(User, tenant, {
                    name: nextName,
                    email: normalizedEmail,
                    username: rawUsername,
                });

                return User.create({
                    tenantId: tenant._id,
                    name: nextName,
                    email: normalizedEmail,
                    username,
                    password: passwordHash,
                    role,
                    mobile_number: nextMobile,
                    phoneKey,
                    canAccessAllLocations: Boolean(locationPayload.canAccessAllLocations),
                    allowedLocationIds: locationPayload.canAccessAllLocations
                        ? []
                        : (locationPayload.allowedLocationIds || []),
                });
            }
        );

        let invite = null;
        if (useInvite) {
            const issued = await passwordSetup.issueToken({
                userId: user._id,
                tenantId: tenant._id,
                email: user.email,
                purpose: "invite",
            });
            invite = {
                inviteToken: issued.token,
                inviteUrl: passwordSetup.relativeUrl(issued.token, user.email),
            };
            try {
                await mailer.sendInvite({
                    to: user.email,
                    name: user.name,
                    gymName: tenant.name,
                    setupUrl: passwordSetup.absoluteUrl(issued.token, user.email),
                });
            } catch (mailErr) {
                logger.warn("mail", "Staff invite email failed", { error: mailErr.message });
            }
        }

        const staffCount = await User.collection.countDocuments({ tenantId: tenant._id });
        const quota = staffQuotaSnapshot(tenant, staffCount);

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_staff_created",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: String(user._id),
            meta: {
                role: user.role,
                invite: Boolean(invite),
                overStaffQuota: quota.overStaffQuota,
                actorEmail: req.platformUser.email,
            },
        });

        res.status(201).json({
            message: invite ? "Staff created; invite issued" : "Staff created",
            user: serializeStaff(user, tenant.ownerUserId),
            invite,
            overStaffQuota: quota.overStaffQuota,
            staffQuotaWarning: quota.staffQuotaWarning,
            staffQuota: { current: quota.current, max: quota.max },
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        if (identityUniqueness.replyIfConflict(res, error)) return;
        logger.error("platform", "createTenantStaff failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/platform/tenants/:id/staff/:userId
 * Body: any of name, email, username, mobile_number, role, password,
 * canAccessAllLocations, allowedLocationIds.
 */
const updateTenantStaff = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const user = await findStaff(tenant._id, req.params.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const {
            name,
            email,
            username: rawUsername,
            mobile_number,
            role,
            password,
            canAccessAllLocations,
            allowedLocationIds,
        } = req.body || {};

        const changes = {};
        const isPrimaryOwner = tenant.ownerUserId && String(user._id) === String(tenant.ownerUserId);

        if (name !== undefined) {
            const nextName = String(name || "").trim();
            if (!nextName) return res.status(400).json({ message: "name is required" });
            if (nextName.length > 120) return res.status(400).json({ message: "name must not exceed 120 characters" });
            if (nextName !== user.name) {
                changes.name = { from: user.name, to: nextName };
                user.name = nextName;
            }
        }

        if (email !== undefined) {
            const normalized = passwordUtils.normalizeEmail(email);
            if (!normalized) return res.status(400).json({ message: "email is required" });
            if (normalized !== user.email) {
                await identityUniqueness.assertEmailAvailable(normalized, { excludeUserId: user._id });
                changes.email = { from: user.email, to: normalized };
                user.email = normalized;
            }
        }

        if (rawUsername !== undefined) {
            const nextUsername = await identityUniqueness.assertUsernameAvailable(rawUsername, {
                excludeUserId: user._id,
            });
            if (nextUsername !== user.username) {
                changes.username = { from: user.username || "", to: nextUsername };
                user.username = nextUsername;
            }
        }

        if (mobile_number !== undefined) {
            const nextMobile = String(mobile_number || "").trim();
            if (!nextMobile) return res.status(400).json({ message: "mobile_number is required" });
            if (nextMobile !== user.mobile_number) {
                const phoneKey = await identityUniqueness.assertPhoneAvailable(nextMobile, {
                    excludeUserId: user._id,
                });
                changes.mobile_number = { from: user.mobile_number || "", to: nextMobile };
                user.mobile_number = nextMobile;
                user.phoneKey = phoneKey;
            }
        }

        if (role !== undefined) {
            if (!GYM_ROLES.includes(role)) {
                return res.status(400).json({ message: "Invalid role" });
            }
            if (isPrimaryOwner && role !== "Owner") {
                return res.status(400).json({
                    message: "Cannot change the primary owner's role. Transfer ownership first.",
                });
            }
            if (role !== user.role) {
                changes.role = { from: user.role, to: role };
                user.role = role;
                user.featureAccess = { grants: [], revokes: [] };
                user.accessOverrides = { add: [], remove: [] };
                if (typeof user.markModified === "function") {
                    user.markModified("featureAccess");
                    user.markModified("accessOverrides");
                }
                syncLegacyFields(user);
            }
        }

        let passwordChanged = false;
        if (password !== undefined && password !== "") {
            if (typeof password !== "string" || password.length < passwordUtils.MIN_PASSWORD_LENGTH) {
                return res.status(400).json({
                    message: `password must be at least ${passwordUtils.MIN_PASSWORD_LENGTH} characters`,
                });
            }
            if (password.length > 200) {
                return res.status(400).json({ message: "password must not exceed 200 characters" });
            }
            user.password = await passwordUtils.hashPassword(password);
            passwordUtils.bumpTokenVersion(user);
            passwordChanged = true;
            changes.password = true;
        }

        if (canAccessAllLocations !== undefined || allowedLocationIds !== undefined) {
            if (isPrimaryOwner || user.role === "Owner") {
                user.canAccessAllLocations = true;
                user.allowedLocationIds = [];
                changes.locationAccess = { canAccessAllLocations: true, allowedLocationIds: [] };
            } else {
                const grant = await runWithTenant(
                    { tenantId: String(tenant._id), tenantSlug: tenant.slug },
                    () => applyLocationAccessToUser(
                        platformActor(req),
                        user,
                        {
                            canAccessAllLocations,
                            allowedLocationIds,
                        },
                        { requireBranches: true }
                    )
                );
                if (grant?.error) {
                    return res.status(grant.status || 400).json({ message: grant.error });
                }
                if (grant) {
                    changes.locationAccess = {
                        canAccessAllLocations: grant.canAccessAllLocations,
                        allowedLocationIds: grant.allowedLocationIds,
                    };
                }
            }
        }

        if (Object.keys(changes).length === 0) {
            return res.json({
                message: "No changes",
                user: serializeStaff(user, tenant.ownerUserId),
            });
        }

        await user.save();

        if (passwordChanged) {
            invalidateAuthContext({ userId: user._id, tenantId: tenant._id });
            await passwordSetup.revokeUnusedTokens(user._id);
        } else if (changes.locationAccess || changes.role) {
            invalidateAuthContext({ userId: user._id, tenantId: tenant._id });
        }

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_staff_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: String(user._id),
            meta: {
                changes,
                actorEmail: req.platformUser.email,
            },
        });

        res.json({
            message: "Staff updated",
            user: serializeStaff(user, tenant.ownerUserId),
        });
    } catch (error) {
        if (identityUniqueness.replyIfConflict(res, error)) return;
        logger.error("platform", "updateTenantStaff failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * DELETE /api/platform/tenants/:id/staff/:userId
 */
const deleteTenantStaff = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const user = await findStaff(tenant._id, req.params.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isPrimaryOwner = tenant.ownerUserId && String(user._id) === String(tenant.ownerUserId);
        if (isPrimaryOwner) {
            return res.status(400).json({
                message: "Cannot delete the primary owner. Transfer ownership first.",
            });
        }

        const snapshot = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        };

        await User.deleteOne({ _id: user._id, tenantId: tenant._id });
        invalidateAuthContext({ userId: user._id, tenantId: tenant._id });
        await passwordSetup.revokeUnusedTokens(user._id);

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_staff_deleted",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "user",
            targetId: String(snapshot._id),
            meta: {
                name: snapshot.name,
                email: snapshot.email,
                role: snapshot.role,
                actorEmail: req.platformUser.email,
            },
        });

        const staffCount = await User.collection.countDocuments({ tenantId: tenant._id });
        const quota = staffQuotaSnapshot(tenant, staffCount);

        res.json({
            message: "Staff deleted",
            overStaffQuota: quota.overStaffQuota,
            staffQuotaWarning: quota.staffQuotaWarning,
            staffQuota: { current: quota.current, max: quota.max },
        });
    } catch (error) {
        logger.error("platform", "deleteTenantStaff failed", { error: error.message });
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
        const context = accessContextFor(tenant);
        const diff = diffConfirmedFeatures(actor, user, features, context);
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
            user: serializeStaff(user, tenant.ownerUserId),
            groups: groupFeaturesFor(actor, user, context),
        });
    } catch (error) {
        logger.error("platform", "updateTenantStaffAccess failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    listTenantStaff,
    getTenantStaffAccess,
    createTenantStaff,
    updateTenantStaff,
    updateTenantStaffAccess,
    deleteTenantStaff,
};
