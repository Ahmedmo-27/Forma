const { isRevoked, hasExplicitGrant } = require("../utils/accessControl");

/**
 * Role check that also honors per-user grants and revokes.
 * A revoke blocks the role. An explicit grant allows a role that is not in the list.
 */
function allowRoles(featureKey, ...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authorized" });
        }
        if (isRevoked(req.user, featureKey)) {
            return res.status(403).json({
                message: "You do not have access to this feature",
                feature: featureKey,
            });
        }
        if (hasExplicitGrant(req.user, featureKey) || roles.includes(req.user.role)) {
            return next();
        }
        return res.status(403).json({
            message: `User role ${req.user.role} is not authorized to access this route`,
            feature: featureKey,
        });
    };
}

/**
 * Lets the request through when the role matches, or either feature was granted.
 * A role match is rejected only when every listed feature is revoked, so one
 * endpoint can serve both assignment and takeover.
 */
function allowAnyFeature(featureKeys, ...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authorized" });
        }
        const granted = featureKeys.some((key) => hasExplicitGrant(req.user, key));
        const roleOk = roles.includes(req.user.role);
        if (!granted && !roleOk) {
            return res.status(403).json({
                message: `User role ${req.user.role} is not authorized to access this route`,
            });
        }
        if (roleOk && featureKeys.every((key) => isRevoked(req.user, key))) {
            return res.status(403).json({
                message: "You do not have access to this feature",
            });
        }
        return next();
    };
}

module.exports = { allowRoles, allowAnyFeature };
