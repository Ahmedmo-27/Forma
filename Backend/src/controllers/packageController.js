const Package = require("../models/Package");
const Location = require("../models/Location");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { publishLive } = require("../utils/liveEvents");
const {
    normalizeLocationEligibility,
    packageListLocationFilter,
} = require("../utils/packageLocationEligibility");

async function assertLocationsExist(ids) {
    if (!ids.length) return null;
    const found = await Location.find({ _id: { $in: ids } }).select("_id").lean();
    if (found.length !== ids.length) {
        return "One or more eligible locations were not found";
    }
    return null;
}

// Create catalog package (Sales Manager / Owner)
const createPackage = async (req, res) => {
    try {
        const {
            name,
            activityType,
            duration,
            price,
            freezeLimitDays,
            invitationLimit,
            renewalDiscountPercent,
            description,
            locationScope,
            eligibleLocationIds,
        } = req.body;

        if (!name?.trim() || price == null) {
            return res.status(400).json({ message: "Name and price are required" });
        }

        const eligibility = normalizeLocationEligibility({ locationScope, eligibleLocationIds });
        if (eligibility.error) {
            return res.status(400).json({ message: eligibility.error });
        }
        const missing = await assertLocationsExist(eligibility.eligibleLocationIds);
        if (missing) return res.status(400).json({ message: missing });

        const pkg = await Package.create({
            name: name.trim(),
            activityType: activityType || "gym",
            duration,
            price: Number(price),
            freezeLimitDays: Number(freezeLimitDays) || 0,
            invitationLimit: Number(invitationLimit) || 0,
            renewalDiscountPercent: Number(renewalDiscountPercent) || 0,
            description: description?.trim() || null,
            locationScope: eligibility.locationScope,
            eligibleLocationIds: eligibility.eligibleLocationIds,
            isActive: true,
            hasException: false,
            createdBy: req.user.id,
        });
        res.status(201).json({ message: "Package created", package: pkg });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all active packages (optionally filtered by navbar branch)
const getAllPackages = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
        const locationFrag = packageListLocationFilter(req);
        const filter = {
            isActive: true,
            hasException: { $ne: true },
            ...locationFrag,
        };

        const [total, packages] = await Promise.all([
            Package.countDocuments(filter),
            Package.find(filter)
                .populate("eligibleLocationIds", "name locationId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
        ]);

        res.status(200).json({
            count: total,
            packages,
            pagination: buildPagination(page, limit, total),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const PACKAGE_UPDATE_FIELDS = [
    "name",
    "activityType",
    "duration",
    "price",
    "freezeLimitDays",
    "invitationLimit",
    "renewalDiscountPercent",
    "description",
    "isActive",
];

// Update package
const updatePackage = async (req, res) => {
    try {
        const update = {};
        for (const key of PACKAGE_UPDATE_FIELDS) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }

        if (req.body.locationScope !== undefined || req.body.eligibleLocationIds !== undefined) {
            const eligibility = normalizeLocationEligibility({
                locationScope: req.body.locationScope,
                eligibleLocationIds: req.body.eligibleLocationIds,
            });
            if (eligibility.error) {
                return res.status(400).json({ message: eligibility.error });
            }
            const missing = await assertLocationsExist(eligibility.eligibleLocationIds);
            if (missing) return res.status(400).json({ message: missing });
            update.locationScope = eligibility.locationScope;
            update.eligibleLocationIds = eligibility.eligibleLocationIds;
        }

        if (!Object.keys(update).length) {
            return res.status(400).json({ message: "No changes to save" });
        }

        const pkg = await Package.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { returnDocument: "after", runValidators: true }
        ).populate("eligibleLocationIds", "name locationId");
        if (!pkg) return res.status(404).json({ message: "Package not found" });
        publishLive(req.user.tenantId, {
            type: "package",
            message: `Package ${pkg.name} was updated`,
            packageId: pkg._id,
            packageName: pkg.name,
        });
        res.status(200).json({ message: "Package updated", package: pkg });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete package (soft delete — set isActive false)
const deletePackage = async (req, res) => {
    try {
        const pkg = await Package.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );
        if (!pkg) return res.status(404).json({ message: "Package not found" });
        res.status(200).json({ message: "Package deactivated" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createPackage, getAllPackages, updatePackage, deletePackage };
