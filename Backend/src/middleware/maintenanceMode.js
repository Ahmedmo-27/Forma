const mongoose = require("mongoose");
const PlatformSetting = require("../models/PlatformSetting");
const { runAsPlatform } = require("../context/tenantContext");
const { MaintenanceError } = require("../utils/errors");
const logger = require("../utils/logger");

const CACHE_TTL_MS = Number(process.env.MAINTENANCE_CACHE_TTL_MS) || 15000;

/**
 * Paths that stay reachable while maintenance mode is on: probes, the platform
 * console (so operators can turn it off), and inbound provider webhooks.
 */
const ALLOWED_PREFIXES = ["/health", "/api/platform", "/api/webhooks"];

let cached = null;
let cachedAt = 0;

function isAllowedPath(path) {
    if (path === "/") return true;
    return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

async function readMaintenanceState() {
    const now = Date.now();
    if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
    // Without a live connection Mongoose would buffer the query; fail open instead.
    if (mongoose.connection.readyState !== 1) return cached || { enabled: false, message: "", estimatedResumeTime: null };
    try {
        const setting = await runAsPlatform(
            () => PlatformSetting.findOne({ key: "maintenance_mode" }).lean(),
            { reason: "maintenance_mode_check" }
        );
        const value = setting?.value || {};
        cached = { enabled: Boolean(value.enabled), message: value.message || "", estimatedResumeTime: value.estimatedResumeTime || null };
    } catch (error) {
        // Fail open: a settings read failure must not take every gym offline.
        logger.warn("maintenance", "Could not read maintenance setting", { error: error.message });
        cached = cached || { enabled: false, message: "", estimatedResumeTime: null };
    }
    cachedAt = now;
    return cached;
}

function clearMaintenanceCache() {
    cached = null;
    cachedAt = 0;
}

async function maintenanceGuard(req, res, next) {
    if (req.method === "OPTIONS" || isAllowedPath(req.path)) return next();
    const state = await readMaintenanceState();
    if (!state.enabled) return next();
    res.setHeader("Retry-After", "300");
    return next(new MaintenanceError(state.message || undefined, state.estimatedResumeTime));
}

module.exports = { maintenanceGuard, clearMaintenanceCache, isAllowedPath, readMaintenanceState };
