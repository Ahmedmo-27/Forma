const mongoose = require("mongoose");
const Location = require("../models/Location");
const {
    resolveAllowedLocationIds,
    userHasAllLocations,
} = require("../utils/locationScope");

const ALL = "all";

function headerLocationId(req) {
    const raw = req.headers["x-location-id"] || req.headers["X-Location-Id"] || req.query.locationId;
    if (raw == null || raw === "") return ALL;
    return String(raw).trim();
}

/**
 * Resolves the active branch scope for the request.
 * Sets:
 *   req.locationScope = {
 *     mode: 'unrestricted' | 'one' | 'subset' | 'none',
 *     locationId?: string,
 *     locationIds?: string[],
 *     selected: 'all' | string,
 *   }
 *   req.locationFilter = Mongo fragment for Member.locationId
 */
async function locationScope(req, res, next) {
    try {
        if (!req.user) return next();

        const allowed = resolveAllowedLocationIds(req.user, req.tenant);
        const selectedRaw = headerLocationId(req);
        const selected = selectedRaw.toLowerCase() === ALL ? ALL : selectedRaw;

        // No grants
        if (Array.isArray(allowed) && allowed.length === 0) {
            req.locationScope = { mode: "none", selected: ALL, locationIds: [] };
            req.locationFilter = { locationId: { $in: [] } };
            return next();
        }

        if (selected === ALL) {
            if (allowed === null) {
                req.locationScope = { mode: "unrestricted", selected: ALL };
                req.locationFilter = {};
            } else {
                req.locationScope = {
                    mode: "subset",
                    selected: ALL,
                    locationIds: allowed,
                };
                req.locationFilter = {
                    locationId: {
                        $in: allowed.map((id) => new mongoose.Types.ObjectId(id)),
                    },
                };
            }
            return next();
        }

        if (!mongoose.Types.ObjectId.isValid(selected)) {
            return res.status(400).json({
                message: "Invalid location id",
                code: "INVALID_LOCATION",
            });
        }

        if (allowed !== null && !allowed.includes(String(selected))) {
            return res.status(403).json({
                message: "You do not have access to this location",
                code: "LOCATION_FORBIDDEN",
            });
        }

        const exists = await Location.findOne({ _id: selected }).select("_id").lean();
        if (!exists) {
            return res.status(404).json({
                message: "Location not found",
                code: "LOCATION_NOT_FOUND",
            });
        }

        req.locationScope = {
            mode: "one",
            selected: String(selected),
            locationId: String(selected),
        };
        req.locationFilter = {
            locationId: new mongoose.Types.ObjectId(String(selected)),
        };
        return next();
    } catch (error) {
        return next(error);
    }
}

/**
 * Soft variant: never 403 — falls back to all/subset. Useful on routes that
 * should still work when multi_branches is off or header is missing.
 */
async function locationScopeOptional(req, res, next) {
    try {
        if (!req.user) return next();
        const hasFeature = Array.isArray(req.planFeatures)
            ? req.planFeatures.includes("multi_branches")
            : (req.tenant && req.plan
                ? require("../models/Tenant").getEffectiveFeatures(req.tenant, req.plan).includes("multi_branches")
                : true);

        if (!hasFeature) {
            req.locationScope = { mode: "unrestricted", selected: ALL };
            req.locationFilter = {};
            return next();
        }

        return locationScope(req, res, next);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    locationScope,
    locationScopeOptional,
    ALL,
    userHasAllLocations,
};
