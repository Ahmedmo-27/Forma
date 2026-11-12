const mongoose = require("mongoose");

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

    // Access Control treats empty / missing role defaults as "all locations".
    // Returning [] here made every list use locationId:$in:[] → Sales Manager saw 0 members.
    return null;
}

function userCanAccessLocation(user, tenant, locationObjectId) {
    if (!locationObjectId) return false;
    const allowed = resolveAllowedLocationIds(user, tenant);
    if (allowed === null) return true;
    return allowed.includes(String(locationObjectId));
}

/**
 * Build a Mongo filter fragment for Member.locationId (home branch).
 * Empty object = no restriction.
 */
function memberLocationFilter(scope) {
    if (!scope || scope.mode === "unrestricted") return {};
    if (scope.mode === "one" && scope.locationId) {
        return { locationId: new mongoose.Types.ObjectId(String(scope.locationId)) };
    }
    if (scope.mode === "subset" && Array.isArray(scope.locationIds) && scope.locationIds.length) {
        return {
            locationId: {
                $in: scope.locationIds.map((id) => new mongoose.Types.ObjectId(String(id))),
            },
        };
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
    return { ...filter, ...loc };
}

function locationFilterIsActive(locationFilter) {
    return Boolean(locationFilter && Object.keys(locationFilter).length > 0);
}

/**
 * Whether a member's home branch matches req.locationFilter.
 */
function memberMatchesLocationFilter(member, locationFilter) {
    if (!locationFilterIsActive(locationFilter)) return true;
    if (!member) return false;
    const raw = member.locationId;
    if (raw == null) return false;
    const id = String(raw._id || raw);
    const clause = locationFilter.locationId;
    if (clause && clause.$in) {
        return clause.$in.some((value) => String(value) === id);
    }
    if (clause != null) {
        return String(clause) === id;
    }
    return true;
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
