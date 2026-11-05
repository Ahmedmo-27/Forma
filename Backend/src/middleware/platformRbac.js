const { hasPermission } = require("../config/platformPermissions");
const logger = require("../utils/logger");

/**
 * Middleware factory requiring a specific platform permission.
 * Must be mounted after `protectPlatform`.
 */
function requirePlatformPermission(permission) {
    return (req, res, next) => {
        if (!req.platformUser) {
            return res.status(401).json({ message: "Authentication required" });
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
            return res.status(403).json({
                message: "Access denied: insufficient platform permissions",
                requiredPermission: permission,
                userRole: role,
            });
        }

        next();
    };
}

module.exports = { requirePlatformPermission };
