const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");
const {
    activeMembershipTenantIds,
    resolveMembership,
    withMembershipContext,
} = require("./staffMembership");
const { formatUserResponse } = require("./userAbilities");
const { setTenantAuthCookie } = require("./authCookies");
const { isCrossSiteAuthRequest } = require("./crossSiteAuth");

const SELECTION_TTL = "5m";
const SESSION_TTL = "8h";

function accessContextFor(tenant) {
    return {
        roleAccess: tenant?.roleAccess || null,
        planFeatures: null,
    };
}

/**
 * Active gym memberships for login picker (name, slug, role, status).
 */
async function loadLoginMemberships(user) {
    const ids = activeMembershipTenantIds(user);
    if (!ids.length) return [];

    const tenants = await runAsPlatform(
        () => Tenant.find({ _id: { $in: ids } })
            .select("name slug status")
            .lean(),
        { reason: "login membership tenant lookup" }
    );
    const byId = new Map(tenants.map((t) => [String(t._id), t]));

    return ids
        .map((id) => {
            const tenant = byId.get(String(id));
            if (!tenant) return null;
            if (tenant.status === "suspended" || tenant.status === "cancelled") return null;
            const membership = resolveMembership(user, id);
            if (!membership) return null;
            return {
                tenantId: String(tenant._id),
                name: tenant.name || tenant.slug || "Gym",
                slug: tenant.slug || "",
                role: membership.role,
            };
        })
        .filter(Boolean);
}

function signSelectionToken(user) {
    return jwt.sign(
        {
            purpose: "tenant_selection",
            id: user._id.toString(),
            version: user.tokenVersion || 0,
        },
        process.env.JWT_SECRET,
        { expiresIn: SELECTION_TTL }
    );
}

function verifySelectionToken(token) {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== "tenant_selection" || !decoded.id) {
        const error = new Error("Invalid selection token");
        error.statusCode = 401;
        throw error;
    }
    return decoded;
}

function signSessionToken(user, tenant, role) {
    return jwt.sign(
        {
            id: user._id.toString(),
            role,
            tenantId: String(tenant._id),
            tenantSlug: tenant.slug || null,
            version: user.tokenVersion || 0,
        },
        process.env.JWT_SECRET,
        { expiresIn: SESSION_TTL }
    );
}

function buildLoginResponse(req, res, user, tenant) {
    const contextual = withMembershipContext(user, tenant._id) || user;
    const role = contextual.role;
    const token = signSessionToken(user, tenant, role);
    const crossSite = isCrossSiteAuthRequest(req);
    setTenantAuthCookie(res, token, { crossSite });

    const formattedUser = formatUserResponse(contextual, {
        includeAccess: true,
        accessContext: accessContextFor(tenant),
        tenant,
    });
    formattedUser.tenantSlug = tenant.slug || null;
    formattedUser.tenantId = String(tenant._id);

    const body = {
        message: "Login successful",
        user: formattedUser,
    };
    if (crossSite) body.token = token;
    return body;
}

module.exports = {
    loadLoginMemberships,
    signSelectionToken,
    verifySelectionToken,
    signSessionToken,
    buildLoginResponse,
};
