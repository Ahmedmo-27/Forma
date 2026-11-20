const mongoose = require("mongoose");
const Location = require("../models/Location");
const Vendor = require("../models/Vendor");
const ProductCategory = require("../models/ProductCategory");
const { userCanAccessLocation } = require("../utils/locationScope");

const DEFAULT_CATEGORIES = [
    { name: "Protein Shakes", section: "bar" },
    { name: "Coffee", section: "bar" },
    { name: "Tea", section: "bar" },
    { name: "Cold Drinks", section: "bar" },
    { name: "Snacks & Food", section: "bar" },
    { name: "Supplements", section: "retail" },
    { name: "Towels & Merch", section: "retail" },
];

const IN_HOUSE_VENDOR_NAME = "Gym Bar";

function httpError(status, message, code) {
    const err = new Error(message);
    err.status = status;
    if (code) err.code = code;
    return err;
}

function isDuplicateKey(error) {
    return error?.code === 11000;
}

/** Error response used by the retail controllers. */
function fail(res, error) {
    if (isDuplicateKey(error)) {
        return res.status(409).json({ message: "An entry with that name or SKU already exists" });
    }
    return res
        .status(error.status || 500)
        .json({ message: error.status ? error.message : "Server error", ...(error.code ? { code: error.code } : {}) });
}

function isObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function assertId(id, label = "id") {
    if (!isObjectId(id)) throw httpError(400, `Invalid ${label}`);
}

function assertLocationAccess(req, locationId) {
    if (!userCanAccessLocation(req.user, req.tenant, locationId)) {
        throw httpError(403, "You do not have access to this location");
    }
}

/**
 * Single branch used for writes and for the POS: explicit id, else the navbar
 * branch, else the gym's first branch (created when missing).
 */
async function resolveLocationId(req, explicitLocationId) {
    const raw = explicitLocationId || req.locationScope?.locationId || req.query?.locationId || null;
    if (raw) {
        assertId(raw, "location id");
        assertLocationAccess(req, raw);
        const exists = await Location.findById(raw).select("_id").lean();
        if (!exists) throw httpError(404, "Location not found");
        return String(exists._id);
    }
    const first = await Location.findOne({}).sort({ createdAt: 1 }).select("_id").lean();
    if (first) {
        assertLocationAccess(req, first._id);
        return String(first._id);
    }
    const { ensureMainLocation } = require("../controllers/locationController");
    const main = await ensureMainLocation(req.user.tenantId);
    return String(main._id);
}

/** Mongo filter limiting a query to the branches the request may see. */
function locationFilterFor(req) {
    return req.locationFilter && Object.keys(req.locationFilter).length ? { ...req.locationFilter } : {};
}

async function ensureDefaultCategories() {
    const count = await ProductCategory.countDocuments({});
    if (count > 0) return;
    try {
        await ProductCategory.insertMany(
            DEFAULT_CATEGORIES.map((cat, index) => ({ ...cat, sortOrder: index })),
            { ordered: false }
        );
    } catch (error) {
        // A concurrent request seeded the same defaults.
        if (!isDuplicateKey(error) && !error?.writeErrors?.every?.((e) => e.code === 11000)) throw error;
    }
}

async function ensureInHouseVendor(locationId, userId = null) {
    const existing = await Vendor.findOne({ locationId, type: "in_house" });
    if (existing) return existing;
    try {
        return await Vendor.create({
            locationId,
            name: IN_HOUSE_VENDOR_NAME,
            type: "in_house",
            commissionPercent: 100,
            createdBy: userId,
        });
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const again = await Vendor.findOne({ locationId, name: IN_HOUSE_VENDOR_NAME });
        if (again) return again;
        throw error;
    }
}

module.exports = {
    DEFAULT_CATEGORIES,
    IN_HOUSE_VENDOR_NAME,
    httpError,
    fail,
    isObjectId,
    assertId,
    assertLocationAccess,
    resolveLocationId,
    locationFilterFor,
    ensureDefaultCategories,
    ensureInHouseVendor,
};
