const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const logger = require("../utils/logger");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");
const { getAuthContext, setAuthContext } = require("./authContextCache");
const { getEffectiveFeatures } = require("../models/Tenant");

function attachPlanFeatures(req) {
    const plan = req.plan && Array.isArray(req.plan.features)
        ? req.plan
        : (req.tenant?.planId && Array.isArray(req.tenant.planId.features) ? req.tenant.planId : null);
    req.planFeatures = req.tenant && plan ? getEffectiveFeatures(req.tenant, plan) : null;
}

/**
 * Verifies Bearer JWT, validates tenant status, reloads user from DB,
 * and initializes AsyncLocalStorage tenant context for all downstream operations.
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
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

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

        let tenantId = decoded.tenantId || null;
        let tenantSlug = decoded.tenantSlug || null;

        if (!decoded.isImpersonation) {
            const cached = getAuthContext(decoded.id, tenantId);
            if (cached) {
                if (sessionIsStale(decoded, cached.user?.tokenVersion)) {
                    return res.status(401).json({ message: "Session revoked. Please sign in again." });
                }
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

        let user = null;
        if (tenantId) {
            await runWithTenant({ tenantId, tenantSlug }, async () => {
                user = await User.findById(decoded.id).select("-password");
            });
        } else {
            // Legacy / migration fallback: look up user across platform
            await runAsPlatform(async () => {
                user = await User.findById(decoded.id).select("-password");
                if (user?.tenantId) {
                    tenantId = user.tenantId.toString();
                }
            }, { reason: "auth_token_legacy_tenant_lookup" });
        }

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
            id: user._id.toString(),
            role: user.role,
            name: user.name,
            email: user.email,
            canViewPhones: user.canViewPhones,
            abilities: user.abilities || {},
            featureAccess: {
                grants: user.featureAccess?.grants || [],
                revokes: user.featureAccess?.revokes || [],
            },
            accessOverrides: {
                add: user.accessOverrides?.add || [],
                remove: user.accessOverrides?.remove || [],
            },
            tokenVersion: Number(user.tokenVersion) || 0,
            canAccessAllLocations: user.canAccessAllLocations === true,
            allowedLocationIds: Array.isArray(user.allowedLocationIds)
                ? user.allowedLocationIds.map((id) => String(id?._id || id)).filter(Boolean)
                : [],
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
