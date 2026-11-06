const { isRevoked, hasExplicitGrant, effectiveAreas } = require("../utils/accessControl");
const { featureArea, isLegacyAccess } = require("../config/roleAccess");

function requestContext(req) {
    return {
        roleAccess: req.tenant?.roleAccess || null,
        planFeatures: Array.isArray(req.planFeatures) ? req.planFeatures : null,
    };
}

/**
 * 'deny'  — the role checklist removed this area
 * 'allow' — the checklist (or a General Manager default) grants the area
 * 'inherit' — keep the historical role allow-list
 */
function roleAreaDecision(req, featureKey) {
    if (!req.user || req.user.role === "Owner") return "inherit";
    const area = featureArea(featureKey);
    if (!area) return "inherit";
    const context = requestContext(req);
    const legacy = isLegacyAccess({
        role: req.user.role,
        roleAccess: context.roleAccess,
        accessOverrides: req.user.accessOverrides,
    });
    if (legacy) return "inherit";
    const areas = effectiveAreas(req.user, context);
    if (!areas.includes(area)) return "deny";
    if (req.user.role === "General Manager") return "allow";
    const { roleDefaults } = require("../utils/accessControl");
    if (!roleDefaults(req.user.role).includes(area)) return "allow";
    return "inherit";
}

function featureDecision(req, featureKey, roles) {
    if (isRevoked(req.user, featureKey)) return "deny";
    const gate = roleAreaDecision(req, featureKey);
    if (gate === "deny") return "deny";
    if (gate === "allow") return "allow";
    if (hasExplicitGrant(req.user, featureKey) || roles.includes(req.user.role)) return "allow";
    return "deny";
}

/**
 * Role check that also honors per-user grants and revokes, and the role checklist.
 */
function allowRoles(featureKey, ...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authorized" });
        }
        if (featureDecision(req, featureKey, roles) === "allow") return next();
        if (isRevoked(req.user, featureKey) || roleAreaDecision(req, featureKey) === "deny") {
            return res.status(403).json({
                message: "You do not have access to this feature",
                feature: featureKey,
            });
        }
        return res.status(403).json({
            message: `User role ${req.user.role} is not authorized to access this route`,
            feature: featureKey,
        });
    };
}

/**
 * Lets the request through when any listed feature is allowed.
 */
function allowAnyFeature(featureKeys, ...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authorized" });
        }
        const allowed = featureKeys.some((key) => featureDecision(req, key, roles) === "allow");
        if (allowed) return next();
        return res.status(403).json({
            message: "You do not have access to this feature",
        });
    };
}

/**
 * Blocks a route group when a saved checklist, a per-user override, or the
 * General Manager default does not include this area. Untouched roles keep
 * their historical access.
 */
function requireAccess(area) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authorized" });
        }
        if (req.user.role === "Owner") return next();
        const context = requestContext(req);
        const legacy = isLegacyAccess({
            role: req.user.role,
            roleAccess: context.roleAccess,
            accessOverrides: req.user.accessOverrides,
        });
        if (legacy) return next();
        const areas = effectiveAreas(req.user, context);
        if (areas.includes(area)) return next();
        return res.status(403).json({
            message: "You do not have access to this feature",
            area,
        });
    };
}

module.exports = { allowRoles, allowAnyFeature, requireAccess, roleAreaDecision };
