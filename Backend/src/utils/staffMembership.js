const mongoose = require("mongoose");
const { runAsPlatform } = require("../context/tenantContext");

const STAFF_ROLES = [
    "Owner",
    "General Manager",
    "Receptionist",
    "Coach",
    "Head Coach",
    "Accountant",
    "Sales",
    "Sales Manager",
    "Retail",
];

function toObjectId(value) {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
    return null;
}

function membershipShape({
    tenantId,
    role,
    allowedLocationIds = [],
    canAccessAllLocations = false,
    status = "active",
    createdAt = new Date(),
} = {}) {
    const tid = toObjectId(tenantId);
    if (!tid) {
        throw new Error("membership requires tenantId");
    }
    return {
        tenantId: tid,
        role: STAFF_ROLES.includes(role) ? role : "Receptionist",
        allowedLocationIds: (Array.isArray(allowedLocationIds) ? allowedLocationIds : [])
            .map((id) => toObjectId(id?._id || id))
            .filter(Boolean),
        canAccessAllLocations: Boolean(canAccessAllLocations),
        status: status === "disabled" ? "disabled" : "active",
        createdAt,
    };
}

/** Build the initial memberships array from a single-tenant user. */
function seedMembershipsFromFields(userLike) {
    if (!userLike?.tenantId) return [];
    return [
        membershipShape({
            tenantId: userLike.tenantId,
            role: userLike.role,
            allowedLocationIds: userLike.allowedLocationIds,
            canAccessAllLocations: userLike.canAccessAllLocations,
            status: "active",
            createdAt: userLike.createdAt || new Date(),
        }),
    ];
}

function listMemberships(user) {
    return Array.isArray(user?.memberships) ? user.memberships : [];
}

/**
 * Resolve the active membership for a gym.
 * Falls back to legacy top-level tenantId/role when memberships is empty.
 */
function resolveMembership(user, tenantId) {
    if (!user || tenantId == null) return null;
    const tid = String(tenantId);
    const memberships = listMemberships(user);

    const hit = memberships.find(
        (m) => String(m.tenantId) === tid && m.status !== "disabled"
    );
    if (hit) {
        return {
            tenantId: hit.tenantId,
            role: hit.role,
            allowedLocationIds: hit.allowedLocationIds || [],
            canAccessAllLocations: hit.canAccessAllLocations === true,
            status: hit.status || "active",
            legacy: false,
        };
    }

    if (memberships.length === 0 && String(user.tenantId) === tid) {
        return {
            tenantId: user.tenantId,
            role: user.role,
            allowedLocationIds: user.allowedLocationIds || [],
            canAccessAllLocations: user.canAccessAllLocations === true,
            status: "active",
            legacy: true,
        };
    }

    return null;
}

function activeMembershipTenantIds(user) {
    const memberships = listMemberships(user);
    if (!memberships.length && user?.tenantId) {
        return [String(user.tenantId)];
    }
    return memberships
        .filter((m) => m.status !== "disabled")
        .map((m) => String(m.tenantId));
}

function hasActiveMembership(user, tenantId) {
    return Boolean(resolveMembership(user, tenantId));
}

/** Overlay role/location fields from the selected membership onto a plain user object. */
function withMembershipContext(user, tenantId) {
    const membership = resolveMembership(user, tenantId);
    if (!membership) return null;
    const base = typeof user.toObject === "function" ? user.toObject() : { ...user };
    return {
        ...base,
        role: membership.role,
        allowedLocationIds: membership.allowedLocationIds,
        canAccessAllLocations: membership.canAccessAllLocations,
        membershipTenantId: membership.tenantId,
    };
}

/**
 * Query filter matching staff whose home tenant OR an active membership is this gym.
 * Use inside runAsPlatform — tenantPlugin would otherwise hide dual-home users.
 */
function staffScopeFilter(tenantId, extra = {}) {
    const tid = toObjectId(tenantId);
    const scope = {
        $or: [
            { tenantId: tid },
            {
                memberships: {
                    $elemMatch: { tenantId: tid, status: "active" },
                },
            },
        ],
    };
    const extraKeys = Object.keys(extra || {});
    if (!extraKeys.length) return scope;
    return { $and: [extra, scope] };
}

async function findStaffInTenant(tenantId, extra = {}, { select, lean = true, sort } = {}) {
    const User = require("../models/User");
    return runAsPlatform(async () => {
        let query = User.find(staffScopeFilter(tenantId, extra));
        if (select) query = query.select(select);
        if (sort) query = query.sort(sort);
        if (lean) query = query.lean();
        return query;
    }, { reason: "dual-aware staff list" });
}

async function countStaffInTenant(tenantId, extra = {}) {
    const User = require("../models/User");
    return runAsPlatform(
        () => User.countDocuments(staffScopeFilter(tenantId, extra)),
        { reason: "dual-aware staff count" }
    );
}

/**
 * Ensure memberships[] includes an entry for the user's home tenantId.
 * Mutates the mongoose document (does not save).
 */
function ensureHomeMembership(user) {
    if (!user?.tenantId) return user;
    const memberships = listMemberships(user);
    const homeId = String(user.tenantId);
    const hasHome = memberships.some((m) => String(m.tenantId) === homeId);
    if (!hasHome) {
        const seeded = seedMembershipsFromFields(user);
        user.memberships = [...seeded, ...memberships];
        if (typeof user.markModified === "function") user.markModified("memberships");
    }
    return user;
}

/**
 * Add or reactivate a membership. Mutates the document (does not save).
 * Syncs top-level role/locations when the membership is for the home tenantId.
 */
function upsertMembership(user, fields) {
    ensureHomeMembership(user);
    const entry = membershipShape(fields);
    const tid = String(entry.tenantId);
    const memberships = listMemberships(user);
    const idx = memberships.findIndex((m) => String(m.tenantId) === tid);
    if (idx >= 0) {
        memberships[idx] = {
            ...memberships[idx],
            ...entry,
            createdAt: memberships[idx].createdAt || entry.createdAt,
        };
    } else {
        memberships.push(entry);
    }
    user.memberships = memberships;
    if (typeof user.markModified === "function") user.markModified("memberships");

    if (String(user.tenantId) === tid) {
        user.role = entry.role;
        user.canAccessAllLocations = entry.canAccessAllLocations;
        user.allowedLocationIds = entry.allowedLocationIds;
    }
    return user;
}

/**
 * Transfer home gym: set tenantId + single active membership; disable others.
 */
function transferHomeTenant(user, fields) {
    const entry = membershipShape({ ...fields, status: "active" });
    user.tenantId = entry.tenantId;
    user.role = entry.role;
    user.canAccessAllLocations = entry.canAccessAllLocations;
    user.allowedLocationIds = entry.allowedLocationIds;
    user.memberships = [entry];
    if (typeof user.markModified === "function") user.markModified("memberships");
    return user;
}

module.exports = {
    STAFF_ROLES,
    membershipShape,
    seedMembershipsFromFields,
    listMemberships,
    resolveMembership,
    activeMembershipTenantIds,
    hasActiveMembership,
    withMembershipContext,
    staffScopeFilter,
    findStaffInTenant,
    countStaffInTenant,
    ensureHomeMembership,
    upsertMembership,
    transferHomeTenant,
};
