const mongoose = require("mongoose");
const Location = require("../models/Location");
const { userHasAllLocations, toIdStrings } = require("./locationScope");

/**
 * Apply branch viewing grants onto a User document (not saved).
 * Returns { allowedLocationIds, canAccessAllLocations } or { error, status }.
 *
 * When neither field is present in body, returns null (no change).
 *
 * @param {object} [options]
 * @param {boolean} [options.requireBranches] — when true, restricted mode needs ≥1 id
 */
async function applyLocationAccessToUser(actor, user, body = {}, options = {}) {
    if (body.allowedLocationIds === undefined && body.canAccessAllLocations === undefined) {
        return null;
    }

    if (!actor || !["Owner", "General Manager"].includes(actor.role)) {
        return { error: "Not authorized to set location access", status: 403 };
    }

    if (user.role === "Owner") {
        user.canAccessAllLocations = true;
        user.allowedLocationIds = [];
        return {
            allowedLocationIds: [],
            canAccessAllLocations: true,
        };
    }

    if (typeof body.canAccessAllLocations === "boolean") {
        user.canAccessAllLocations = body.canAccessAllLocations;
        if (body.canAccessAllLocations) {
            user.allowedLocationIds = [];
            if (typeof user.markModified === "function") {
                user.markModified("allowedLocationIds");
            }
            return {
                allowedLocationIds: [],
                canAccessAllLocations: true,
            };
        }
    }

    if (Array.isArray(body.allowedLocationIds)) {
        const ids = body.allowedLocationIds
            .map((id) => String(id || "").trim())
            .filter(Boolean);

        if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
            return { error: "allowedLocationIds must be valid location ids", status: 400 };
        }

        if (
            options.requireBranches
            && ids.length === 0
            && body.canAccessAllLocations !== true
        ) {
            return {
                error: "Select at least one branch, or enable access to all locations",
                status: 400,
            };
        }

        if (ids.length) {
            const found = await Location.find({ _id: { $in: ids } }).select("_id").lean();
            if (found.length !== ids.length) {
                return { error: "One or more locations were not found", status: 400 };
            }
        }

        user.allowedLocationIds = ids;
        if (body.canAccessAllLocations !== true) {
            user.canAccessAllLocations = false;
        }
    }

    if (typeof user.markModified === "function") {
        user.markModified("allowedLocationIds");
    }

    return {
        allowedLocationIds: toIdStrings(user.allowedLocationIds),
        canAccessAllLocations: userHasAllLocations(user),
    };
}

/**
 * Defaults for a newly created staff user when the creator did not send location fields.
 * - General Manager → all locations
 * - Others → empty personal list (middleware resolves roleLocationAccess)
 */
function defaultLocationFieldsForRole(role) {
    if (role === "Owner" || role === "General Manager") {
        return { canAccessAllLocations: true, allowedLocationIds: [] };
    }
    return { canAccessAllLocations: false, allowedLocationIds: [] };
}

module.exports = {
    applyLocationAccessToUser,
    defaultLocationFieldsForRole,
};
