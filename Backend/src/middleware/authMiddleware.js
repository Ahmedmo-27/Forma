const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const logger = require("../utils/logger");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");
const { getAuthContext, setAuthContext } = require("./authContextCache");
const { getEffectiveFeatures } = require("../models/Tenant");
const { readTenantToken } = require("../utils/authCookies");
const featureSync = require("../services/featureSync");
const {
    maybeClearExpiredSuspension,
    loginDeniedPayload,
    suspensionExpired,
} = require("../utils/staffRestriction");

function rejectIfStaffRestricted(res, userLike) {
    const denied = loginDeniedPayload(userLike);
    if (!denied) return false;
    res.status(denied.status).json({
        code: denied.code,
        message: denied.message,
        details: denied.details,
    });
    return true;
}

function staffRestrictionSnapshot(user) {
    return {
        isBlocked: Boolean(user?.isBlocked),
        restrictionType: user?.restrictionType || null,
        suspendedUntil: user?.suspendedUntil || null,
        blockedReason: user?.blockedReason || null,
    };
}

function attachPlanFeatures(req) {
    const plan = req.plan && Array.isArray(req.plan.features)
        ? req.plan
        : (req.tenant?.planId && Array.isArray(req.tenant.planId.features) ? req.tenant.planId : null);
    req.planFeatures = req.tenant && plan ? getEffectiveFeatures(req.tenant, plan) : null;
}

/**
 * Verifies tenant JWT (Authorization Bearer or forma_tenant cookie), validates
 * tenant status, reloads user from DB, and initializes AsyncLocalStorage tenant
 * context for all downstream operations.
 */
const ACTIVITY_GAP_MS = 15 * 60 * 1000;
const activityTouches = new Map();

function activityIsDue(previousAt, now, gapMs = ACTIVITY_GAP_MS) {
    return now - (previousAt || 0) >= gapMs;
}

function claimActivityTouch(touches, tenantId, now = Date.now()) {
    if (!tenantId) return false;
    const key = String(tenantId);
    if (!activityIsDue(touches.get(key), now)) return false;
    touches.set(key, now);
    return true;
}

function sessionIsStale(decoded, storedVersion) {
    const claimed = decoded && Number.isFinite(decoded.version) ? decoded.version : 0;
    const current = Number(storedVersion) || 0;
    return claimed < current;
}

function touchTenantActivity(tenantId) {
    if (!tenantId || mongoose.connection.readyState !== 1) return;
    if (!claimActivityTouch(activityTouches, tenantId)) return;
    runAsPlatform(() => Tenant.updateOne({ _id: tenantId }, { $set: { lastActivityAt: new Date() } }))
        .catch((error) => logger.auth("warn", "Could not record gym activity", { error: error.message }));
}

const protect = async (req, res, next) => {
    const token = readTenantToken(req);

    if (!token) {
        logger.auth("warn", "Auth middleware: no token", {
            path: req.originalUrl,
            method: req.method,
            ip: req.ip,
        });
        return res.status(401).json({ message: "Not authorized, no token" });
    }

    if (!process.env.JWT_SECRET) {
        logger.auth("error", "Auth middleware: JWT_SECRET missing", {
            path: req.originalUrl,
        });
        return res.status(500).json({ message: "Server misconfigured: JWT_SECRET is missing" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Plans must carry newly registered module keys before we read this gym's plan.
        await featureSync.ensureSynced();

        let tenantId = decoded.tenantId || null;
        let tenantSlug = decoded.tenantSlug || null;

        if (!decoded.isImpersonation) {
            const cached = getAuthContext(decoded.id, tenantId);
            const cacheExpiredSuspend = cached?.user
                && suspensionExpired({
                    restrictionType: cached.user.restrictionType,
                    suspendedUntil: cached.user.suspendedUntil,
                    isBlocked: cached.user.isBlocked,
                });
            if (cached && !cacheExpiredSuspend) {
                if (sessionIsStale(decoded, cached.user?.tokenVersion)) {
                    return res.status(401).json({ message: "Session revoked. Please sign in again." });
                }
                if (rejectIfStaffRestricted(res, cached.user)) return;
                const cachedStatus = cached.tenant?.status;
                if (cachedStatus === "suspended" || cachedStatus === "cancelled") {
                    return res.status(403).json({
                        code: "TENANT_SUSPENDED",
                        message: "Your gym's subscription is suspended or cancelled. Please contact your administrator.",
                    });
                }
                tenantSlug = cached.tenantSlug || tenantSlug;
                req.tenant = cached.tenant;
                req.plan = cached.plan;
                attachPlanFeatures(req);
                req.user = {
                    ...cached.user,
                    tenantId: tenantId ? String(tenantId) : cached.user.tenantId || null,
                    tenantSlug,
                    isImpersonation: false,
                    impersonatedBy: null,
                    platformAdminName: null,
                    readOnly: false,
                };
                if (tenantId) {
                    touchTenantActivity(tenantId);
                    return runWithTenant({ tenantId, tenantSlug }, () => {
                        next();
                    });
                }
                return next();
            }
        }

        // Always load via platform so dual-membership staff (home tenant ≠ JWT tenant) resolve.
        let user = null;
        await runAsPlatform(async () => {
            user = await User.findById(decoded.id).select("-password");
            if (user && !tenantId && user.tenantId) {
                tenantId = user.tenantId.toString();
            }
        }, { reason: "auth_token_user_lookup" });

        if (!user) {
            logger.auth("warn", "Auth middleware: user not found for token", {
                path: req.originalUrl,
                userId: decoded.id,
            });
            return res.status(401).json({ message: "Not authorized, user not found" });
        }

        if (sessionIsStale(decoded, user.tokenVersion)) {
            return res.status(401).json({ message: "Session revoked. Please sign in again." });
        }

        const {
            hasActiveMembership,
            withMembershipContext,
        } = require("../utils/staffMembership");

        if (tenantId && !hasActiveMembership(user, tenantId)) {
            logger.auth("warn", "Auth middleware: no membership for JWT tenant", {
                path: req.originalUrl,
                userId: decoded.id,
                tenantId,
            });
            return res.status(401).json({ message: "Not authorized for this gym" });
        }

        const contextualUser = tenantId
            ? (withMembershipContext(user, tenantId) || user)
            : user;

        await maybeClearExpiredSuspension(user);
        if (rejectIfStaffRestricted(res, user)) return;

        if (tenantId) {
            // Validate tenant status
            const tenant = await runAsPlatform(async () => {
                const found = Tenant.findById(tenantId);
                if (found && typeof found.populate === "function") {
                    return found.populate("planId");
                }
                return found;
            });

            if (tenant) {
                req.tenant = tenant;
                req.plan = tenant.planId && Array.isArray(tenant.planId.features)
                    ? tenant.planId
                    : null;
                attachPlanFeatures(req);
                if (tenant.status === "suspended" || tenant.status === "cancelled") {
                    return res.status(403).json({
                        code: "TENANT_SUSPENDED",
                        message: "Your gym's subscription is suspended or cancelled. Please contact your administrator.",
                    });
                }
                tenantSlug = tenant.slug;
            }
        }

        const authUser = {
            id: contextualUser._id.toString(),
            role: contextualUser.role,
            name: contextualUser.name,
            email: contextualUser.email,
            canViewPhones: contextualUser.canViewPhones,
            abilities: contextualUser.abilities || {},
            featureAccess: {
                grants: contextualUser.featureAccess?.grants || [],
                revokes: contextualUser.featureAccess?.revokes || [],
            },
            accessOverrides: {
                add: contextualUser.accessOverrides?.add || [],
                remove: contextualUser.accessOverrides?.remove || [],
            },
            tokenVersion: Number(user.tokenVersion) || 0,
            canAccessAllLocations: contextualUser.canAccessAllLocations === true,
            allowedLocationIds: Array.isArray(contextualUser.allowedLocationIds)
                ? contextualUser.allowedLocationIds.map((id) => String(id?._id || id)).filter(Boolean)
                : [],
            ...staffRestrictionSnapshot(user),
        };
        req.user = {
            ...authUser,
            tenantId: tenantId ? String(tenantId) : null,
            tenantSlug,
            isImpersonation: Boolean(decoded.isImpersonation),
            impersonatedBy: decoded.impersonatedBy || decoded.platformAdminId || null,
            platformAdminName: decoded.platformAdminName || null,
            readOnly: Boolean(decoded.readOnly),
        };
        if (!decoded.isImpersonation && req.user.tenantId) {
            setAuthContext(decoded.id, decoded.tenantId || null, {
                user: authUser,
                tenant: req.tenant || null,
                plan: req.plan || null,
                tenantId: req.user.tenantId,
                tenantSlug,
            });
        }

        // Block mutating HTTP requests if impersonation session is read-only
        if (req.user.isImpersonation && req.user.readOnly) {
            const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes((req.method || "").toUpperCase());
            const isLogout = (req.originalUrl || "").includes("/logout");
            if (isMutation && !isLogout) {
                return res.status(403).json({
                    code: "IMPERSONATION_READ_ONLY",
                    message: "Read-only platform support impersonation active. Mutations are strictly blocked.",
                });
            }
        }

        if (tenantId) {
            touchTenantActivity(tenantId);
            runWithTenant({ tenantId, tenantSlug }, () => {
                next();
            });
        } else {
            next();
        }
    } catch (err) {
        logger.auth("warn", "Auth middleware: token verification failed", {
            path: req.originalUrl,
            method: req.method,
            error: err.name,
            message: err.message,
            hasJwtSecret: Boolean(process.env.JWT_SECRET),
        });
        res.status(401).json({ message: "Token failed" });
    }
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            logger.auth("warn", "Auth middleware: role not authorized", {
                path: req.originalUrl,
                userRole: req.user.role,
                allowedRoles: roles,
                userId: req.user.id,
            });
            return res.status(403).json({
                message: `User role ${req.user.role} is not authorized to access this route`,
            });
        }
        next();
    };
};

module.exports = {
    protect,
    authorizeRoles,
    attachPlanFeatures,
    sessionIsStale,
    activityIsDue,
    claimActivityTouch,
    ACTIVITY_GAP_MS,
};
