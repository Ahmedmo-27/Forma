const crypto = require("crypto");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

const REFRESH_MS = 60 * 1000;
const MODES = ["all", "pilot", "percentage", "off"];

/** featureKey -> { mode, percentage, pilotTenantIds:Set<string> } for features not on "all". */
let rules = new Map();
/** Keys of catalog features switched off platform-wide (Feature.isActive === false). */
let inactive = new Set();
let loadedAt = 0;
let refreshing = null;

/** Stable 0-99 bucket so a gym keeps the same answer as the percentage grows. */
function bucketFor(featureKey, tenantId) {
    const digest = crypto.createHash("sha1").update(`${featureKey}:${tenantId}`).digest();
    return digest.readUInt32BE(0) % 100;
}

function normalizeRule(rollout = {}) {
    const mode = MODES.includes(rollout.mode) ? rollout.mode : "all";
    const percentage = Math.max(0, Math.min(100, Math.round(Number(rollout.percentage) || 0)));
    const pilotTenantIds = new Set((rollout.pilotTenantIds || []).map(String));
    return { mode, percentage, pilotTenantIds };
}

/** Pilot gyms are always in; percentage mode adds a stable slice of everyone else. */
function isRolledOutTo(rule, featureKey, tenantId) {
    if (!rule || rule.mode === "all") return true;
    if (rule.mode === "off" || !tenantId) return false;
    const id = String(tenantId);
    if (rule.pilotTenantIds.has(id)) return true;
    if (rule.mode === "percentage") return bucketFor(featureKey, id) < rule.percentage;
    return false;
}

function setRules(features) {
    const next = new Map();
    const off = new Set();
    for (const feature of features) {
        if (feature.isActive === false) off.add(feature.key);
        const rule = normalizeRule(feature.rollout);
        if (rule.mode !== "all") next.set(feature.key, rule);
    }
    rules = next;
    inactive = off;
    loadedAt = Date.now();
}

async function refreshRules() {
    if (mongoose.connection.readyState !== 1) return;
    if (refreshing) return refreshing;
    const Feature = require("../models/Feature");
    refreshing = Feature.find({ $or: [{ "rollout.mode": { $in: ["pilot", "percentage", "off"] } }, { isActive: false }] })
        .select("key rollout isActive")
        .lean()
        .then(setRules)
        .catch((error) => logger.warn("features", "Could not refresh feature rollouts", { error: error.message }))
        .finally(() => { refreshing = null; });
    return refreshing;
}

function refreshIfStale() {
    if (Date.now() - loadedAt > REFRESH_MS) refreshRules();
}

/**
 * Drops plan features this gym is not in the rollout for. Features the platform
 * added explicitly for the gym (featureOverrides.add) stay on as an opt-in.
 */
function applyRollout(features, tenant) {
    refreshIfStale();
    if (!rules.size && !inactive.size) return features;
    const tenantId = tenant?._id || tenant?.id;
    const explicit = new Set(tenant?.featureOverrides?.add || []);
    return features.filter((key) => {
        // A deactivated feature is off for everyone, even where it was added explicitly.
        if (inactive.has(key)) return false;
        return explicit.has(key) || isRolledOutTo(rules.get(key), key, tenantId);
    });
}

function rolloutSummary(rollout) {
    const rule = normalizeRule(rollout);
    return { mode: rule.mode, percentage: rule.percentage, pilotCount: rule.pilotTenantIds.size };
}

module.exports = {
    MODES,
    bucketFor,
    normalizeRule,
    isRolledOutTo,
    applyRollout,
    refreshRules,
    rolloutSummary,
    _setRulesForTest: setRules,
};
