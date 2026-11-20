const mongoose = require("mongoose");
const MaintenanceItem = require("../models/MaintenanceItem");
const MaintenanceLog = require("../models/MaintenanceLog");
const Location = require("../models/Location");
const {
    resolveAllowedLocationIds,
    userCanAccessLocation,
} = require("../utils/locationScope");

const { computeStatus } = require("../utils/maintenanceStatus");
const { clearResolvedReminders } = require("../services/maintenanceReminders");

function serializeUser(user) {
    if (!user) return null;
    return {
        _id: String(user._id),
        name: user.name || user.username || "",
        username: user.username || "",
        role: user.role || "",
    };
}

function serializeItem(item) {
    return {
        _id: String(item._id),
        locationId: String(item.locationId),
        title: item.title,
        description: item.description || "",
        intervalValue: item.intervalValue,
        intervalUnit: item.intervalUnit,
        active: item.active !== false,
        createdBy: item.createdBy ? String(item.createdBy) : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

function serializeLog(log) {
    return {
        _id: String(log._id),
        itemId: String(log.itemId),
        locationId: String(log.locationId),
        completedAt: log.completedAt,
        notes: log.notes || "",
        completedBy: serializeUser(log.completedBy),
    };
}

function assertObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

async function resolveTargetLocationIds(req, { locationId, targetLocationIds, allLocations }) {
    const allowed = resolveAllowedLocationIds(req.user, req.tenant);
    const all = await Location.find({}).select("_id").lean();
    const allIds = all.map((loc) => String(loc._id));
    const permitted = allowed === null ? allIds : allIds.filter((id) => allowed.includes(id));

    if (allLocations) {
        if (!permitted.length) {
            const err = new Error("No accessible locations");
            err.status = 400;
            throw err;
        }
        return permitted;
    }

    if (Array.isArray(targetLocationIds) && targetLocationIds.length) {
        const unique = [...new Set(targetLocationIds.map(String))];
        const invalid = unique.filter((id) => !assertObjectId(id) || !permitted.includes(id));
        if (invalid.length) {
            const err = new Error("One or more target locations are invalid or inaccessible");
            err.status = 400;
            throw err;
        }
        return unique;
    }

    const primary = locationId ? String(locationId) : null;
    if (!primary || !assertObjectId(primary) || !permitted.includes(primary)) {
        const err = new Error("A valid locationId is required");
        err.status = 400;
        throw err;
    }
    return [primary];
}

function requireSingleLocation(req) {
    const scope = req.locationScope;
    if (scope?.mode === "one" && scope.locationId) {
        return String(scope.locationId);
    }
    const fromQuery = req.query.locationId ? String(req.query.locationId) : null;
    if (fromQuery && assertObjectId(fromQuery)) {
        if (!userCanAccessLocation(req.user, req.tenant, fromQuery)) {
            const err = new Error("You do not have access to this location");
            err.status = 403;
            throw err;
        }
        return fromQuery;
    }
    const err = new Error("Select a single branch to view the maintenance board");
    err.status = 400;
    err.code = "LOCATION_REQUIRED";
    throw err;
}

async function latestLogsByItem(itemIds) {
    if (!itemIds.length) return new Map();
    const logs = await MaintenanceLog.aggregate([
        { $match: { itemId: { $in: itemIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
        { $sort: { completedAt: -1 } },
        {
            $group: {
                _id: "$itemId",
                completedAt: { $first: "$completedAt" },
                completedBy: { $first: "$completedBy" },
                notes: { $first: "$notes" },
                logId: { $first: "$_id" },
            },
        },
    ]);
    const userIds = [...new Set(logs.map((row) => String(row.completedBy)).filter(Boolean))];
    const User = require("../models/User");
    const users = userIds.length
        ? await User.find({ _id: { $in: userIds } }).select("name username role").lean()
        : [];
    const byUser = new Map(users.map((u) => [String(u._id), u]));
    const map = new Map();
    for (const row of logs) {
        map.set(String(row._id), {
            _id: String(row.logId),
            completedAt: row.completedAt,
            notes: row.notes || "",
            completedBy: serializeUser(byUser.get(String(row.completedBy))),
        });
    }
    return map;
}

const listItems = async (req, res) => {
    try {
        const filter = {};
        if (req.query.active === "true") filter.active = true;
        if (req.query.active === "false") filter.active = false;

        const locationId = req.query.locationId ? String(req.query.locationId) : null;
        if (locationId) {
            if (!assertObjectId(locationId) || !userCanAccessLocation(req.user, req.tenant, locationId)) {
                return res.status(403).json({ message: "You do not have access to this location" });
            }
            filter.locationId = locationId;
        } else if (req.locationScope?.mode === "one" && req.locationScope.locationId) {
            filter.locationId = req.locationScope.locationId;
        } else if (req.locationScope?.mode === "subset" && Array.isArray(req.locationScope.locationIds)) {
            filter.locationId = { $in: req.locationScope.locationIds };
        } else {
            const allowed = resolveAllowedLocationIds(req.user, req.tenant);
            if (allowed !== null) filter.locationId = { $in: allowed };
        }

        const items = await MaintenanceItem.find(filter).sort({ title: 1 }).lean();
        res.json({ items: items.map(serializeItem) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

const createItems = async (req, res) => {
    try {
        const {
            title,
            description = "",
            intervalValue,
            intervalUnit,
            locationId,
            targetLocationIds,
            allLocations,
        } = req.body;

        const targets = await resolveTargetLocationIds(req, {
            locationId,
            targetLocationIds,
            allLocations,
        });

        const docs = targets.map((locId) => ({
            locationId: locId,
            title,
            description: description || "",
            intervalValue,
            intervalUnit,
            active: true,
            createdBy: req.user._id,
        }));

        const created = await MaintenanceItem.insertMany(docs);
        res.status(201).json({ items: created.map((doc) => serializeItem(doc.toObject ? doc.toObject() : doc)) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

const updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!assertObjectId(id)) return res.status(400).json({ message: "Invalid id" });

        const item = await MaintenanceItem.findById(id);
        if (!item) return res.status(404).json({ message: "Maintenance item not found" });
        if (!userCanAccessLocation(req.user, req.tenant, item.locationId)) {
            return res.status(403).json({ message: "You do not have access to this location" });
        }

        const { title, description, intervalValue, intervalUnit, active } = req.body;
        if (title !== undefined) item.title = title;
        if (description !== undefined) item.description = description;
        if (intervalValue !== undefined) item.intervalValue = intervalValue;
        if (intervalUnit !== undefined) item.intervalUnit = intervalUnit;
        if (active !== undefined) item.active = active;
        await item.save();

        res.json({ item: serializeItem(item.toObject()) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

const deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!assertObjectId(id)) return res.status(400).json({ message: "Invalid id" });

        const item = await MaintenanceItem.findById(id);
        if (!item) return res.status(404).json({ message: "Maintenance item not found" });
        if (!userCanAccessLocation(req.user, req.tenant, item.locationId)) {
            return res.status(403).json({ message: "You do not have access to this location" });
        }

        item.active = false;
        await item.save();
        res.json({ item: serializeItem(item.toObject()) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

const copyItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!assertObjectId(id)) return res.status(400).json({ message: "Invalid id" });

        const item = await MaintenanceItem.findById(id).lean();
        if (!item) return res.status(404).json({ message: "Maintenance item not found" });
        if (!userCanAccessLocation(req.user, req.tenant, item.locationId)) {
            return res.status(403).json({ message: "You do not have access to this location" });
        }

        const { targetLocationIds, allLocations } = req.body;
        const targets = await resolveTargetLocationIds(req, {
            locationId: null,
            targetLocationIds,
            allLocations,
        });
        const destinations = targets.filter((locId) => locId !== String(item.locationId));
        if (!destinations.length) {
            return res.status(400).json({ message: "Choose at least one other branch to copy to" });
        }

        const docs = destinations.map((locId) => ({
            locationId: locId,
            title: item.title,
            description: item.description || "",
            intervalValue: item.intervalValue,
            intervalUnit: item.intervalUnit,
            active: true,
            createdBy: req.user._id,
        }));
        const created = await MaintenanceItem.insertMany(docs);
        res.status(201).json({ items: created.map((doc) => serializeItem(doc.toObject ? doc.toObject() : doc)) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

const getBoard = async (req, res) => {
    try {
        const locationId = requireSingleLocation(req);
        const items = await MaintenanceItem.find({ locationId, active: true }).sort({ title: 1 }).lean();
        const lastByItem = await latestLogsByItem(items.map((item) => item._id));
        const now = new Date();

        const board = items.map((item) => {
            const last = lastByItem.get(String(item._id)) || null;
            const computed = computeStatus(item, last?.completedAt || null, now);
            return {
                ...serializeItem(item),
                status: computed.status,
                nextDueAt: computed.nextDueAt,
                lastCompletedAt: computed.lastCompletedAt,
                lastCompletion: last,
            };
        });

        board.sort((a, b) => {
            const order = { overdue: 0, due: 1, ok: 2 };
            const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
            if (diff !== 0) return diff;
            return String(a.title).localeCompare(String(b.title));
        });

        res.json({ locationId, items: board });
    } catch (error) {
        res.status(error.status || 500).json({
            message: error.message || "Server error",
            code: error.code,
        });
    }
};

const completeItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!assertObjectId(id)) return res.status(400).json({ message: "Invalid id" });

        const item = await MaintenanceItem.findById(id);
        if (!item || item.active === false) {
            return res.status(404).json({ message: "Maintenance item not found" });
        }
        if (!userCanAccessLocation(req.user, req.tenant, item.locationId)) {
            return res.status(403).json({ message: "You do not have access to this location" });
        }

        const notes = req.body?.notes || "";
        const log = await MaintenanceLog.create({
            itemId: item._id,
            locationId: item.locationId,
            completedBy: req.user._id,
            completedAt: new Date(),
            notes,
        });

        const populated = await MaintenanceLog.findById(log._id)
            .populate("completedBy", "name username role")
            .lean();

        await clearResolvedReminders(item.locationId);

        res.status(201).json({ log: serializeLog(populated) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

const getHistory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!assertObjectId(id)) return res.status(400).json({ message: "Invalid id" });

        const item = await MaintenanceItem.findById(id).lean();
        if (!item) return res.status(404).json({ message: "Maintenance item not found" });
        if (!userCanAccessLocation(req.user, req.tenant, item.locationId)) {
            return res.status(403).json({ message: "You do not have access to this location" });
        }

        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const logs = await MaintenanceLog.find({ itemId: id })
            .sort({ completedAt: -1 })
            .limit(limit)
            .populate("completedBy", "name username role")
            .lean();

        res.json({ item: serializeItem(item), logs: logs.map(serializeLog) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Server error" });
    }
};

module.exports = {
    listItems,
    createItems,
    updateItem,
    deleteItem,
    copyItem,
    getBoard,
    completeItem,
    getHistory,
};
