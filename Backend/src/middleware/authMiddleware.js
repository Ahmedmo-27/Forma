const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const logger = require("../utils/logger");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");

/**
 * Verifies Bearer JWT, validates tenant status, reloads user from DB,
 * and initializes AsyncLocalStorage tenant context for all downstream operations.
 */
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

        if (tenantId) {
            // Validate tenant status
            const tenant = await runAsPlatform(async () => {
                return await Tenant.findById(tenantId);
            });

            if (tenant) {
                if (tenant.status === "suspended" || tenant.status === "cancelled") {
                    return res.status(403).json({
                        code: "TENANT_SUSPENDED",
                        message: "Your gym's subscription is suspended or cancelled. Please contact your administrator.",
                    });
                }
                tenantSlug = tenant.slug;
            }
        }

        req.user = {
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
            tenantId: tenantId ? String(tenantId) : null,
            tenantSlug,
            isImpersonation: Boolean(decoded.isImpersonation),
            impersonatedBy: decoded.impersonatedBy || decoded.platformAdminId || null,
            platformAdminName: decoded.platformAdminName || null,
            readOnly: Boolean(decoded.readOnly),
        };

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

module.exports = { protect, authorizeRoles };
