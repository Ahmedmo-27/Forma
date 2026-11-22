const mongoose = require("mongoose");
const {
    memberLinkedLocationIds,
    memberLinkedToLocationsClause,
} = require("./memberLocations");

/**
 * Owner always has all-location access. GM (and others) use canAccessAllLocations
 * or an explicit allowedLocationIds / role default list.
 */
function userHasAllLocations(user) {
    if (!user) return false;
    if (user.role === "Owner") return true;
    return user.canAccessAllLocations === true;
}

function toIdStrings(ids) {
    if (!Array.isArray(ids)) return [];
    return ids
        .map((id) => (id == null ? null : String(id._id || id)))
        .filter(Boolean);
}

/**
 * Resolve which location ObjectIds a user may access.
 * @returns {null|string[]} null means all locations in the tenant
 */
function resolveAllowedLocationIds(user, tenant) {
    if (userHasAllLocations(user)) return null;

    const personal = toIdStrings(user?.allowedLocationIds);
    if (personal.length) return personal;

    const roleKey = user?.role;
    const roleDefaults = tenant?.roleLocationAccess?.[roleKey];
    if (Array.isArray(roleDefaults) && roleDefaults.length) {
        return toIdStrings(roleDefaults);
    }

    // PRODUCT DECISION (keep): empty personal + role grants = all locations in the tenant.
    // Restricted-until-granted would return [] and break Sales Manager / Call Center lists
    // until Access Control is configured. Owners still force-bypass via userHasAllLocations.
    return null;
}

function userCanAccessLocation(user, tenant, locationObjectId) {
    if (!locationObjectId) return false;
    const allowed = resolveAllowedLocationIds(user, tenant);
    if (allowed === null) return true;
    return allowed.includes(String(locationObjectId));
}

/**
 * Active branch ids for a request locationScope (empty = unrestricted / none).
 * @returns {null|string[]} null = unrestricted (show all users); [] = none
 */
function scopeLocationIdStrings(locationScope) {
    if (!locationScope || locationScope.mode === "unrestricted") return null;
    if (locationScope.mode === "none") return [];
    if (locationScope.mode === "one" && locationScope.locationId) {
        return [String(locationScope.locationId)];
    }
    if (locationScope.mode === "subset" && Array.isArray(locationScope.locationIds)) {
        return locationScope.locationIds.map((id) => String(id));
    }
    return null;
}

/**
 * Whether a staff user should appear in branch-scoped lists (Call Center authors, teams, access).
 * Access-based: all-access users always match; otherwise grants must intersect the active scope.
 */
function userVisibleInLocationScope(user, tenant, locationScope) {
    const scopeIds = scopeLocationIdStrings(locationScope);
    if (scopeIds === null) return true;
    if (!scopeIds.length) return false;

    const allowed = resolveAllowedLocationIds(user, tenant);
    if (allowed === null) return true;
    if (!allowed.length) return false;
    return allowed.some((id) => scopeIds.includes(String(id)));
}

function filterUsersByLocationScope(users, tenant, locationScope) {
    if (!Array.isArray(users)) return [];
    const scopeIds = scopeLocationIdStrings(locationScope);
    if (scopeIds === null) return users;
    return users.filter((user) => userVisibleInLocationScope(user, tenant, locationScope));
}

/**
 * Build a Mongo filter fragment for members linked to the active branch scope
 * (primary locationId or any entry in locationIds).
 * Empty object = no restriction.
 */
function memberLocationFilter(scope) {
    if (!scope || scope.mode === "unrestricted") return {};
    if (scope.mode === "one" && scope.locationId) {
        return memberLinkedToLocationsClause([scope.locationId]);
    }
    if (scope.mode === "subset" && Array.isArray(scope.locationIds) && scope.locationIds.length) {
        return memberLinkedToLocationsClause(scope.locationIds);
    }
    if (scope.mode === "none") {
        // No granted locations — match nothing
        return { locationId: { $in: [] } };
    }
    return {};
}

/**
 * ElemMatch for today's check-in logs scoped to a location (or set).
 */
function checkInLocationElemMatch(scope, dateRange) {
    const base = {
        type: "check-in",
        createdAt: { $gte: dateRange.start, $lte: dateRange.end },
    };
    if (!scope || scope.mode === "unrestricted") return base;
    if (scope.mode === "one" && scope.locationId) {
        return { ...base, locationId: new mongoose.Types.ObjectId(String(scope.locationId)) };
    }
    if (scope.mode === "subset" && Array.isArray(scope.locationIds) && scope.locationIds.length) {
        return {
            ...base,
            locationId: {
                $in: scope.locationIds.map((id) => new mongoose.Types.ObjectId(String(id))),
            },
        };
    }
    if (scope.mode === "none") {
        return { ...base, locationId: { $in: [] } };
    }
    return base;
}

function mergeLocationIntoFilter(filter, scope) {
    const loc = memberLocationFilter(scope);
    if (!Object.keys(loc).length) return filter;
    // $or location clauses must go under $and so they do not clobber other filters
    if (loc.$or) {
        const next = { ...filter };
        if (!next.$and) next.$and = [];
        next.$and.push(loc);
        return next;
    }
    return { ...filter, ...loc };
}

function locationFilterIsActive(locationFilter) {
    return Boolean(locationFilter && Object.keys(locationFilter).length > 0);
}

function extractLocationIdsFromFilter(locationFilter) {
    const targets = new Set();
    const collect = (clause) => {
        if (!clause || typeof clause !== "object") return;
        const lid = clause.locationId;
        if (lid && lid.$in) {
            for (const value of lid.$in) targets.add(String(value));
        } else if (lid != null) {
            targets.add(String(lid._id || lid));
        }
        const lids = clause.locationIds;
        if (lids && lids.$in) {
            for (const value of lids.$in) targets.add(String(value));
        } else if (lids != null && !Array.isArray(lids)) {
            targets.add(String(lids._id || lids));
        }
    };

    if (Array.isArray(locationFilter.$or)) {
        for (const clause of locationFilter.$or) collect(clause);
        return [...targets];
    }
    if (Array.isArray(locationFilter.$and)) {
        for (const clause of locationFilter.$and) {
            if (clause?.$or) {
                for (const nested of clause.$or) collect(nested);
            } else {
                collect(clause);
            }
        }
        if (targets.size) return [...targets];
    }
    collect(locationFilter);
    return [...targets];
}

/**
 * Whether a member's linked branches intersect req.locationFilter.
 */
function memberMatchesLocationFilter(member, locationFilter) {
    if (!locationFilterIsActive(locationFilter)) return true;
    if (!member) return false;
    const memberIds = memberLinkedLocationIds(member);
    if (!memberIds.length) return false;

    const targets = extractLocationIdsFromFilter(locationFilter);
    if (!targets.length) return true;
    return memberIds.some((id) => targets.includes(id));
}

/**
 * 403 payload when member is outside the active navbar/grant scope; null if allowed.
 */
function forbidIfOutOfLocationScope(req, member) {
    if (!locationFilterIsActive(req?.locationFilter)) return null;
    if (memberMatchesLocationFilter(member, req.locationFilter)) return null;
    return {
        status: 403,
        code: "MEMBER_LOCATION_FORBIDDEN",
        message: "This member is outside the selected branch scope",
    };
}

/**
 * Distinct member ObjectIds matching a location filter (empty filter → null = no restriction).
 */
async function memberIdsMatchingLocationFilter(locationFilter, MemberModel) {
    if (!locationFilterIsActive(locationFilter)) return null;
    return MemberModel.find(locationFilter).distinct("_id");
}

function serializeLocation(doc) {
    if (!doc) return null;
    return {
        _id: doc._id,
        name: doc.name,
        locationId: doc.locationId,
        branch_location: doc.branch_location || "",
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

module.exports = {
    userHasAllLocations,
    resolveAllowedLocationIds,
    userCanAccessLocation,
    scopeLocationIdStrings,
    userVisibleInLocationScope,
    filterUsersByLocationScope,
    memberLocationFilter,
    checkInLocationElemMatch,
    mergeLocationIntoFilter,
    locationFilterIsActive,
    memberMatchesLocationFilter,
    forbidIfOutOfLocationScope,
    memberIdsMatchingLocationFilter,
    serializeLocation,
    toIdStrings,
};
