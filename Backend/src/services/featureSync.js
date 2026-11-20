const mongoose = require("mongoose");
const Feature = require("../models/Feature");
const Plan = require("../models/Plan");
const Tenant = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");
const logger = require("../utils/logger");
const { FEATURES, RETIRED_FEATURES, catalogEntry } = require("../config/featureRegistry");

const SNAPSHOT_PATH = "billing.lifetime.featureSnapshot";

let syncPromise = null;
let synced = false;

function mongoReady() {
    return mongoose.connection.readyState === 1;
}

/**
 * Adds a new module key to every plan and to non-empty lifetime snapshots, so
 * gyms keep exactly what they had before the key existed.
 */
async function addKeyToAllPlans(key) {
    await Plan.updateMany({ features: { $ne: key } }, { $addToSet: { features: key } });
    await Tenant.updateMany(
        { [`${SNAPSHOT_PATH}.0`]: { $exists: true }, [SNAPSHOT_PATH]: { $ne: key } },
        { $addToSet: { [SNAPSHOT_PATH]: key } }
    );
}

async function retireKeys(keys) {
    if (!keys.length) return;
    await Feature.deleteMany({ key: { $in: keys } });
    await Plan.updateMany({ features: { $in: keys } }, { $pull: { features: { $in: keys } } });
    await Tenant.updateMany(
        { [SNAPSHOT_PATH]: { $in: keys } },
        { $pull: { [SNAPSHOT_PATH]: { $in: keys } } }
    );
    await Tenant.updateMany(
        { $or: [{ "featureOverrides.add": { $in: keys } }, { "featureOverrides.remove": { $in: keys } }] },
        { $pull: { "featureOverrides.add": { $in: keys }, "featureOverrides.remove": { $in: keys } } }
    );
}

/**
 * Makes the Feature catalog match config/featureRegistry. Idempotent:
 * - registers missing catalog entries (never overwrites operator edits)
 * - backfills `backfill: "all"` keys onto existing plans exactly once
 * - retires keys that no longer gate anything
 */
async function syncFeatureCatalog() {
    const summary = { created: [], backfilled: [], retired: [] };

    await runAsPlatform(async () => {
        for (const feature of FEATURES) {
            const before = await Feature.findOneAndUpdate(
                { key: feature.key },
                { $setOnInsert: { ...catalogEntry(feature), plansBackfilledAt: null } },
                { upsert: true, new: false }
            ).select("plansBackfilledAt").lean();

            if (!before) summary.created.push(feature.key);
            if (before?.plansBackfilledAt) continue;

            if (feature.backfill === "all") {
                await addKeyToAllPlans(feature.key);
                summary.backfilled.push(feature.key);
            }
            await Feature.updateOne(
                { key: feature.key, plansBackfilledAt: null },
                { $set: { plansBackfilledAt: new Date() } }
            );
        }

        await retireKeys(RETIRED_FEATURES);
        summary.retired = [...RETIRED_FEATURES];

        // The pricing page used to highlight "gold" by name. Carry that over once
        // (only while the field has never been written) so it is now a plan flag.
        await Plan.updateOne({ key: "gold", featured: { $exists: false } }, { $set: { featured: true } });
    }, { reason: "sync_feature_catalog" });

    if (summary.created.length || summary.backfilled.length) {
        logger.info("features", "Feature catalog synced", summary);
    }
    return summary;
}

/**
 * Runs the sync once per process. Request paths await this so a gym never hits
 * a freshly gated module before existing plans were backfilled. A no-op when
 * Mongo is not connected (unit tests, cold start).
 */
async function ensureSynced() {
    if (synced || !mongoReady()) return;
    if (!syncPromise) {
        syncPromise = syncFeatureCatalog()
            .then(() => {
                synced = true;
            })
            .catch((error) => {
                logger.warn("features", "Feature catalog sync failed", { error: error.message });
            })
            .finally(() => {
                syncPromise = null;
            });
    }
    await syncPromise;
}

function _resetForTest() {
    synced = false;
    syncPromise = null;
}

module.exports = { syncFeatureCatalog, ensureSynced, addKeyToAllPlans, _resetForTest };
