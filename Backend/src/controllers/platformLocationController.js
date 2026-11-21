const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");
const Location = require("../models/Location");
const Member = require("../models/Member");
const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");
const { runWithTenant } = require("../context/tenantContext");
const sequence = require("../utils/sequence");
const { serializeLocation } = require("../utils/locationScope");
const {
    formatCode,
    syncBranchCount,
    ensureMainLocation,
} = require("./locationController");

function isObjectId(value) {
    if (!mongoose.Types.ObjectId.isValid(value)) return false;
    return String(new mongoose.Types.ObjectId(value)) === String(value);
}

async function findTenant(id) {
    if (!isObjectId(id)) return null;
    return Tenant.findById(id).populate("planId");
}

function buildQuota(tenant, branchCount) {
    const plan = tenant?.planId?.features || tenant?.planId?.limits ? tenant.planId : null;
    const features = getEffectiveFeatures(tenant, plan);
    const limits = getEffectiveLimits(tenant, plan);
    const maxBranches = limits.maxBranches != null ? limits.maxBranches : 1;
    const multiBranchesEnabled = features.includes("multi_branches");
    const overByLimit = branchCount > maxBranches;
    const overWithoutMulti = !multiBranchesEnabled && branchCount > 1;
    const overQuota = overByLimit || overWithoutMulti;

    let quotaWarning = null;
    if (overQuota) {
        const parts = [
            `This gym is over its allowed branch quota (${branchCount}/${maxBranches}).`,
            `Plan limit: ${maxBranches}.`,
            `Multi-branch feature: ${multiBranchesEnabled ? "on" : "off"}.`,
        ];
        quotaWarning = parts.join(" ");
    }

    return {
        current: branchCount,
        max: maxBranches,
        multiBranchesEnabled,
        overQuota,
        quotaWarning,
    };
}

/**
 * GET /api/platform/tenants/:id/locations
 */
const listTenantLocations = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const locations = await runWithTenant(
            { tenantId: String(tenant._id), tenantSlug: tenant.slug },
            async () => {
                let all = await Location.find({}).sort({ createdAt: 1 }).lean();
                if (!all.length) {
                    const main = await ensureMainLocation(tenant._id);
                    all = [main.toObject ? main.toObject() : main];
                }
                return all;
            }
        );

        const quota = buildQuota(tenant, locations.length);
        res.json({
            locations: locations.map(serializeLocation),
            quota: {
                current: quota.current,
                max: quota.max,
                multiBranchesEnabled: quota.multiBranchesEnabled,
            },
            overQuota: quota.overQuota,
            quotaWarning: quota.quotaWarning,
        });
    } catch (error) {
        logger.error("platform", "listTenantLocations failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * POST /api/platform/tenants/:id/locations
 * Support override: never 403 for multi_branches / maxBranches; surface overQuota instead.
 */
const createTenantLocation = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const name = String(req.body?.name || "").trim();
        if (!name) return res.status(400).json({ message: "name is required" });

        const branch_location = String(req.body?.branch_location || "").trim();

        const location = await runWithTenant(
            { tenantId: String(tenant._id), tenantSlug: tenant.slug },
            async () => {
                const seq = await sequence.nextSequence("locationId", 1, String(tenant._id));
                const locationId = formatCode(seq);
                return Location.create({ name, locationId, branch_location });
            }
        );

        const branchCount = await syncBranchCount(tenant._id);
        const quota = buildQuota(tenant, branchCount);

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_location_created",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "location",
            targetId: String(location._id),
            meta: {
                name: location.name,
                locationId: location.locationId,
                overQuota: quota.overQuota,
                quota: {
                    current: quota.current,
                    max: quota.max,
                    multiBranchesEnabled: quota.multiBranchesEnabled,
                },
                actorEmail: req.platformUser.email,
            },
        });

        res.status(201).json({
            message: "Location created",
            location: serializeLocation(location),
            overQuota: quota.overQuota,
            quotaWarning: quota.quotaWarning,
            quota: {
                current: quota.current,
                max: quota.max,
                multiBranchesEnabled: quota.multiBranchesEnabled,
            },
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: "A location with this code already exists" });
        }
        logger.error("platform", "createTenantLocation failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * PATCH /api/platform/tenants/:id/locations/:locationId
 */
const updateTenantLocation = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
        if (!isObjectId(req.params.locationId)) {
            return res.status(400).json({ message: "Invalid location id" });
        }

        const location = await runWithTenant(
            { tenantId: String(tenant._id), tenantSlug: tenant.slug },
            async () => {
                const doc = await Location.findById(req.params.locationId);
                if (!doc) return null;

                if (req.body?.name != null) {
                    const name = String(req.body.name).trim();
                    if (!name) {
                        const err = new Error("name cannot be empty");
                        err.status = 400;
                        throw err;
                    }
                    doc.name = name;
                }
                if (req.body?.branch_location != null) {
                    doc.branch_location = String(req.body.branch_location).trim();
                }
                await doc.save();
                return doc;
            }
        );

        if (!location) return res.status(404).json({ message: "Location not found" });

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_location_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "location",
            targetId: String(location._id),
            meta: {
                name: location.name,
                locationId: location.locationId,
                actorEmail: req.platformUser.email,
            },
        });

        const branchCount = await Location.collection.countDocuments({ tenantId: tenant._id });
        const quota = buildQuota(tenant, branchCount);

        res.json({
            message: "Location updated",
            location: serializeLocation(location),
            overQuota: quota.overQuota,
            quotaWarning: quota.quotaWarning,
            quota: {
                current: quota.current,
                max: quota.max,
                multiBranchesEnabled: quota.multiBranchesEnabled,
            },
        });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ message: error.message });
        }
        logger.error("platform", "updateTenantLocation failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * DELETE /api/platform/tenants/:id/locations/:locationId
 */
const deleteTenantLocation = async (req, res) => {
    try {
        const tenant = await findTenant(req.params.id);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
        if (!isObjectId(req.params.locationId)) {
            return res.status(400).json({ message: "Invalid location id" });
        }

        const result = await runWithTenant(
            { tenantId: String(tenant._id), tenantSlug: tenant.slug },
            async () => {
                const location = await Location.findById(req.params.locationId);
                if (!location) return { notFound: true };

                const total = await Location.countDocuments({});
                if (total <= 1) {
                    return {
                        error: {
                            status: 400,
                            body: {
                                message: "Cannot delete the last location",
                                code: "LAST_LOCATION",
                            },
                        },
                    };
                }

                const memberCount = await Member.countDocuments({ locationId: location._id });
                if (memberCount > 0) {
                    return {
                        error: {
                            status: 400,
                            body: {
                                message: `Reassign ${memberCount} member(s) before deleting this location`,
                                code: "LOCATION_HAS_MEMBERS",
                                memberCount,
                            },
                        },
                    };
                }

                const snapshot = {
                    _id: location._id,
                    name: location.name,
                    locationId: location.locationId,
                };
                await Location.deleteOne({ _id: location._id });
                return { deleted: snapshot };
            }
        );

        if (result.notFound) return res.status(404).json({ message: "Location not found" });
        if (result.error) return res.status(result.error.status).json(result.error.body);

        const branchCount = await syncBranchCount(tenant._id);
        const quota = buildQuota(tenant, branchCount);

        await AuditLog.create({
            tenantId: tenant._id,
            action: "platform_location_deleted",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "location",
            targetId: String(result.deleted._id),
            meta: {
                name: result.deleted.name,
                locationId: result.deleted.locationId,
                actorEmail: req.platformUser.email,
            },
        });

        res.json({
            message: "Location deleted",
            overQuota: quota.overQuota,
            quotaWarning: quota.quotaWarning,
            quota: {
                current: quota.current,
                max: quota.max,
                multiBranchesEnabled: quota.multiBranchesEnabled,
            },
        });
    } catch (error) {
        logger.error("platform", "deleteTenantLocation failed", { error: error.message });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    listTenantLocations,
    createTenantLocation,
    updateTenantLocation,
    deleteTenantLocation,
    buildQuota,
};
