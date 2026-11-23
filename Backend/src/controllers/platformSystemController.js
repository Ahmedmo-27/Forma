const mongoose = require("mongoose");
const PlatformSetting = require("../models/PlatformSetting");
const cacheService = require("../services/cacheService");
const logger = require("../utils/logger");
const publicSiteService = require("../services/publicSiteService");
const { clearMaintenanceCache } = require("../middleware/maintenanceMode");
const { writePlatformAudit, getAuditHealth } = require("../utils/audit");
const { listJobRuns } = require("../utils/jobRuns");
const monitoring = require("../services/monitoring");
const mailer = require("../services/mailer");
const storageService = require("../services/storageService");

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
        const publicSite = await publicSiteService.getPublicSiteSetting();
        const [jobs, audit, storage] = await Promise.all([
            listJobRuns().catch((error) => {
                logger.warn("platform", "Could not load job runs", { error: error.message });
                return [];
            }),
            getAuditHealth(),
            storageService.probeHealth().catch((error) => ({
                ok: false,
                error: error.message,
            })),
        ]);

        const mail = mailer.getMailHealth();
        const depsOk = dbState === 1 && storage.ok !== false && !mail.degraded;
        res.json({
            status: depsOk ? "healthy" : "degraded",
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
            dependencies: {
                mail,
                storage,
                redisRateLimits: Boolean(process.env.REDIS_URL),
                singleReplicaRequired: !process.env.REDIS_URL,
            },
            maintenance,
            publicSite,
            jobs,
            audit,
            monitoring: { sentry: monitoring.isEnabled() },
            settings: {
                dunningSchedule: dunningSetting?.value || { gracePeriodDays: 3, reminderDays: [3, 1], trialReminderDays: [7, 3, 1], overdueReminderDays: [0, 2] },
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
        const { enabled, message, estimatedResumeTime } = req.body;
        const resumeAt = estimatedResumeTime ? new Date(estimatedResumeTime) : null;
        const value = {
            enabled: Boolean(enabled),
            message: message || "System undergoing scheduled maintenance. Please check back shortly.",
            estimatedResumeTime: resumeAt && !Number.isNaN(resumeAt.getTime()) ? resumeAt.toISOString() : null,
            updatedAt: new Date(),
            updatedBy: req.platformUser.email,
        };

        await PlatformSetting.findOneAndUpdate(
            { key: "maintenance_mode" },
            { $set: { value, updatedBy: req.platformUser.id } },
            { upsert: true, new: true }
        );
        clearMaintenanceCache();
        await writePlatformAudit({
            action: "maintenance_mode_toggled",
            actor: req.platformUser.id,
            targetType: "other",
            meta: { enabled: value.enabled, message: value.message, estimatedResumeTime: value.estimatedResumeTime },
            req,
        });

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

/**
 * Publish / unpublish www marketing site (super_admin only at route layer).
 * POST /api/platform/system/public-site
 */
async function togglePublicSite(req, res) {
    try {
        if (req.platformUser?.role !== "super_admin") {
            return res.status(403).json({ message: "Only platform super admins can change public site visibility" });
        }

        const { published, message } = req.body;
        const value = await publicSiteService.setPublicSiteSetting({
            published,
            message,
            actor: req.platformUser,
        });

        logger.info("platform", "Public site visibility toggled", {
            published: value.published,
            updatedBy: req.platformUser.email,
        });

        res.json({
            message: value.published
                ? "Public marketing site is now visible to guests"
                : "Public marketing site is under development (super admin preview only)",
            publicSite: value,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getSystemHealth,
    toggleMaintenanceMode,
    togglePublicSite,
    updatePlatformSetting,
};
