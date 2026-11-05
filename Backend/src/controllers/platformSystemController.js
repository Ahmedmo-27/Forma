const mongoose = require("mongoose");
const PlatformSetting = require("../models/PlatformSetting");
const cacheService = require("../services/cacheService");
const logger = require("../utils/logger");

/**
 * Get Comprehensive System Health & Status
 * GET /api/platform/system/health
 */
async function getSystemHealth(_req, res) {
    try {
        const dbState = mongoose.connection.readyState;
        const dbStatusMap = {
            0: "disconnected",
            1: "connected",
            2: "connecting",
            3: "disconnecting",
        };

        const memory = process.memoryUsage();
        const uptime = process.uptime();

        const maintenanceSetting = await PlatformSetting.findOne({ key: "maintenance_mode" });
        const maintenance = maintenanceSetting?.value || { enabled: false, message: "" };

        const dunningSetting = await PlatformSetting.findOne({ key: "dunning_schedule" });
        const sellerSetting = await PlatformSetting.findOne({ key: "seller_details" });

        res.json({
            status: dbState === 1 ? "healthy" : "degraded",
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(uptime),
            database: {
                status: dbStatusMap[dbState] || "unknown",
                name: mongoose.connection.name || "leap",
            },
            memory: {
                rssMb: Math.round(memory.rss / (1024 * 1024)),
                heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
                heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
            },
            cache: cacheService.getStats(),
            maintenance,
            settings: {
                dunningSchedule: dunningSetting?.value || { gracePeriodDays: 3, reminderDays: [3, 1] },
                sellerDetails: sellerSetting?.value || null,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Toggle Global Maintenance Mode
 * POST /api/platform/system/maintenance
 */
async function toggleMaintenanceMode(req, res) {
    try {
        const { enabled, message } = req.body;
        const value = {
            enabled: Boolean(enabled),
            message: message || "System undergoing scheduled maintenance. Please check back shortly.",
            updatedAt: new Date(),
            updatedBy: req.platformUser.email,
        };

        await PlatformSetting.findOneAndUpdate(
            { key: "maintenance_mode" },
            { $set: { value, updatedBy: req.platformUser.id } },
            { upsert: true, new: true }
        );

        logger.info("platform", "Platform maintenance mode toggled", { enabled, updatedBy: req.platformUser.email });
        res.json({ message: `Maintenance mode ${enabled ? "ENABLED" : "DISABLED"}`, maintenance: value });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Update Platform Settings (Seller details, Dunning, Retention)
 * PATCH /api/platform/system/settings/:key
 */
async function updatePlatformSetting(req, res) {
    try {
        const { key } = req.params;
        const { value, description } = req.body;

        const setting = await PlatformSetting.findOneAndUpdate(
            { key },
            {
                $set: {
                    value,
                    description: description || "",
                    updatedBy: req.platformUser.id,
                },
            },
            { upsert: true, new: true }
        );

        res.json({ message: `Setting '${key}' updated`, setting });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getSystemHealth,
    toggleMaintenanceMode,
    updatePlatformSetting,
};
