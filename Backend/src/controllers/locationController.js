const mongoose = require("mongoose");
const Location = require("../models/Location");
const Member = require("../models/Member");
const TenantUsage = require("../models/TenantUsage");
const { getEffectiveLimits, getEffectiveFeatures } = require("../models/Tenant");
const { nextSequence } = require("../utils/sequence");
const { writeAudit } = require("../utils/audit");
const { runAsPlatform } = require("../context/tenantContext");
const {
    resolveAllowedLocationIds,
    userHasAllLocations,
    serializeLocation,
} = require("../utils/locationScope");

function formatCode(seq) {
    return `LOC-${String(seq).padStart(3, "0")}`;
}

async function syncBranchCount(tenantId) {
    const count = await Location.countDocuments({});
    await runAsPlatform(async () => {
        await TenantUsage.findOneAndUpdate(
            { tenantId },
            {
                $set: { branchCount: count, refreshedAt: new Date() },
                $setOnInsert: { tenantId },
            },
            { upsert: true }
        );
    }, { reason: "sync_branch_count" });
    return count;
}

async function ensurePlanAllowsMulti(req) {
    const { ensureTenantMultiBranches } = require("../utils/ensureMultiBranches");
    if (req.tenant && req.plan) {
        await ensureTenantMultiBranches(req.tenant, req.plan);
        // Reload plan features after backfill
        if (req.plan._id) {
            const Plan = require("../models/Plan");
            const { runAsPlatform } = require("../context/tenantContext");
            const fresh = await runAsPlatform(async () => Plan.findById(req.plan._id));
            if (fresh) req.plan = fresh;
        }
    }
    const features = getEffectiveFeatures(req.tenant, req.plan);
    return features.includes("multi_branches");
}

const listLocations = async (req, res) => {
    try {
        let all = await Location.find({}).sort({ createdAt: 1 }).lean();
        if (!all.length && req.user?.tenantId) {
            const main = await ensureMainLocation(req.user.tenantId);
            all = [main.toObject ? main.toObject() : main];
        }
        const allowed = resolveAllowedLocationIds(req.user, req.tenant);
        const visible =
            allowed === null
                ? all
                : all.filter((loc) => allowed.includes(String(loc._id)));

        res.json({
            locations: visible.map(serializeLocation),
            // null allowed set = unrestricted (incl. empty role defaults)
            canAccessAllLocations: userHasAllLocations(req.user) || allowed === null,
            canManage: req.user.role === "Owner",
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const createLocation = async (req, res) => {
    try {
        if (req.user.role !== "Owner") {
            return res.status(403).json({ message: "Only the owner can manage locations" });
        }

        const multi = await ensurePlanAllowsMulti(req);
        const existingCount = await Location.countDocuments({});

        // Without multi_branches, allow at most one location (Main bootstrap).
        if (!multi && existingCount >= 1) {
            return res.status(403).json({
                code: "FEATURE_NOT_IN_PLAN",
                message: "Multi-branch locations are not enabled on your plan. Upgrade to Gold or Platinum.",
            });
        }

        const limits = getEffectiveLimits(req.tenant, req.plan);
        if (existingCount >= (limits.maxBranches || 1)) {
            return res.status(403).json({
                code: "BRANCH_LIMIT_REACHED",
                message: `Your plan allows up to ${limits.maxBranches} location(s).`,
            });
        }

        const name = String(req.body?.name || "").trim();
        if (!name) {
            return res.status(400).json({ message: "name is required" });
        }

        const branch_location = String(req.body?.branch_location || "").trim();
        const seq = await nextSequence("locationId", 1);
        const locationId = formatCode(seq);

        const location = await Location.create({
            name,
            locationId,
            branch_location,
        });

        await syncBranchCount(req.user.tenantId);

        await writeAudit({
            action: "location_created",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "location",
            targetId: location._id,
            meta: { name, locationId },
            req,
        });

        res.status(201).json({ message: "Location created", location: serializeLocation(location) });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: "A location with this code already exists" });
        }
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateLocation = async (req, res) => {
    try {
        if (req.user.role !== "Owner") {
            return res.status(403).json({ message: "Only the owner can manage locations" });
        }

        const location = await Location.findById(req.params.id);
        if (!location) {
            return res.status(404).json({ message: "Location not found" });
        }

        if (req.body?.name != null) {
            const name = String(req.body.name).trim();
            if (!name) return res.status(400).json({ message: "name cannot be empty" });
            location.name = name;
        }
        if (req.body?.branch_location != null) {
            location.branch_location = String(req.body.branch_location).trim();
        }

        await location.save();

        await writeAudit({
            action: "location_updated",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "location",
            targetId: location._id,
            meta: { name: location.name, locationId: location.locationId },
            req,
        });

        res.json({ message: "Location updated", location: serializeLocation(location) });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const deleteLocation = async (req, res) => {
    try {
        if (req.user.role !== "Owner") {
            return res.status(403).json({ message: "Only the owner can manage locations" });
        }

        const location = await Location.findById(req.params.id);
        if (!location) {
            return res.status(404).json({ message: "Location not found" });
        }

        const total = await Location.countDocuments({});
        if (total <= 1) {
            return res.status(400).json({
                message: "Cannot delete the last location",
                code: "LAST_LOCATION",
            });
        }

        const memberCount = await Member.countDocuments({ locationId: location._id });
        if (memberCount > 0) {
            return res.status(400).json({
                message: `Reassign ${memberCount} member(s) before deleting this location`,
                code: "LOCATION_HAS_MEMBERS",
                memberCount,
            });
        }

        await Location.deleteOne({ _id: location._id });
        await syncBranchCount(req.user.tenantId);

        await writeAudit({
            action: "location_deleted",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "location",
            targetId: location._id,
            meta: { name: location.name, locationId: location.locationId },
            req,
        });

        res.json({ message: "Location deleted" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * Ensure a Main location exists for the current tenant. Used by migration
 * and as a safety net when listing.
 */
async function ensureMainLocation(tenantId) {
    // Unit tests / cold start without Mongo: fail fast instead of 10s buffer timeout
    if (mongoose.connection.readyState !== 1) {
        const err = new Error("MongoDB is not connected; cannot ensure Main location");
        err.code = "DB_NOT_CONNECTED";
        throw err;
    }

    const existing = await Location.findOne({}).sort({ createdAt: 1 });
    if (existing) return existing;

    const location = await Location.create({
        name: "Main",
        locationId: "LOC-001",
        branch_location: "",
    });

    // Keep sequence at least 1 so next create is LOC-002
    try {
        await nextSequence("locationId", 1, tenantId ? String(tenantId) : null);
    } catch (_) {
        // Sequence bump is best-effort during bootstrap
    }
    if (tenantId) await syncBranchCount(tenantId);
    return location;
}

module.exports = {
    listLocations,
    createLocation,
    updateLocation,
    deleteLocation,
    ensureMainLocation,
    syncBranchCount,
    formatCode,
};
