const mongoose = require("mongoose");

/**
 * Normalize location eligibility fields from a request body / package doc.
 */
function normalizeLocationEligibility(input = {}) {
    const locationScope = input.locationScope === "branches" ? "branches" : "all";
    const rawIds = Array.isArray(input.eligibleLocationIds) ? input.eligibleLocationIds : [];
    const eligibleLocationIds = rawIds
        .map((id) => String(id?._id || id || "").trim())
        .filter(Boolean);

    if (locationScope === "branches" && eligibleLocationIds.length === 0) {
        return { error: "Select at least one branch when location scope is branches" };
    }
    if (eligibleLocationIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
        return { error: "eligibleLocationIds must be valid location ids" };
    }

    return {
        locationScope,
        eligibleLocationIds: locationScope === "branches" ? eligibleLocationIds : [],
    };
}

/**
 * Whether a package may be sold/assigned at a given member home location.
 * Packages with locationScope "all" (or legacy missing field) are always eligible.
 */
function packageEligibleForLocation(pkg, memberLocationId) {
    if (!pkg) return false;
    const scope = pkg.locationScope === "branches" ? "branches" : "all";
    if (scope === "all") return true;
    if (!memberLocationId) return false;
    const allowed = (pkg.eligibleLocationIds || []).map((id) => String(id._id || id));
    return allowed.includes(String(memberLocationId._id || memberLocationId));
}

function allOrBranchesContaining(ids) {
    return {
        $or: [
            { locationScope: { $in: ["all", null] } },
            { locationScope: { $exists: false } },
            { locationScope: "branches", eligibleLocationIds: { $in: ids } },
        ],
    };
}

/**
 * Mongo filter fragment for listing packages visible at the active branch scope.
 * - catalog=all → full catalog (Manage Packages)
 * - unrestricted / all selection → full catalog
 * - single branch → all-scope OR eligible for that branch
 * - subset → all-scope OR intersects granted branch ids
 */
function packageListLocationFilter(req) {
    if (String(req.query?.catalog || "").toLowerCase() === "all") {
        return {};
    }

    const scope = req.locationScope;
    if (!scope || scope.mode === "unrestricted") {
        return {};
    }

    if (scope.mode === "one" && scope.locationId) {
        return allOrBranchesContaining([new mongoose.Types.ObjectId(String(scope.locationId))]);
    }

    if (scope.mode === "subset" && Array.isArray(scope.locationIds) && scope.locationIds.length) {
        return allOrBranchesContaining(
            scope.locationIds.map((id) => new mongoose.Types.ObjectId(String(id)))
        );
    }

    if (scope.mode === "none") {
        return {
            $or: [
                { locationScope: { $in: ["all", null] } },
                { locationScope: { $exists: false } },
            ],
        };
    }

    return {};
}

module.exports = {
    normalizeLocationEligibility,
    packageEligibleForLocation,
    packageListLocationFilter,
};
