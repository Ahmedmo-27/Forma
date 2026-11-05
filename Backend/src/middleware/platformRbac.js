const { hasPermission } = require("../config/platformPermissions");
const logger = require("../utils/logger");

/**
 * Middleware factory requiring a specific platform permission.
 * Must be mounted after `protectPlatform`.
 */
function requirePlatformPermission(permission) {
    return (req, res, next) => {
        if (!req.platformUser) {
            const message = "Authentication required";
            return res.status(401).json({
                error: {
                    code: "AUTH_TOKEN_INVALID",
                    message,
                    status: 401,
                    requestId: req.requestId,
                },
                message,
            });
        }

        const role = req.platformUser.role;
        if (!hasPermission(role, permission)) {
            logger.warn("platform", "Platform permission denied", {
                userId: req.platformUser.id,
                email: req.platformUser.email,
                role,
                requiredPermission: permission,
                path: req.originalUrl,
                method: req.method,
            });
            const message = "Access denied: insufficient platform permissions";
            return res.status(403).json({
                error: {
                    code: "AUTH_FORBIDDEN",
                    message,
                    status: 403,
                    requestId: req.requestId,
                    details: { requiredPermission: permission, userRole: role },
                },
                message,
                requiredPermission: permission,
                userRole: role,
            });
        }

        next();
    };
}

module.exports = { requirePlatformPermission };
