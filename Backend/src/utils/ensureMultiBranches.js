const Feature = require("../models/Feature");
const Plan = require("../models/Plan");
const { runAsPlatform } = require("../context/tenantContext");
const { getEffectiveFeatures } = require("../models/Tenant");

const MULTI = "multi_branches";
const TIER_KEYS = ["gold", "platinum"];

const FEATURE_META = {
    key: MULTI,
    name: "Multi-Branch Locations",
    category: "core",
    description:
        "Link multiple gym branches, switch location data in the navbar, and grant staff per-location access",
    isCore: false,
};

let plansEnsuredAt = 0;
const PLANS_TTL_MS = 60_000;

/**
 * Ensure the Feature catalog entry exists and Gold/Platinum plan.features
 * include multi_branches (idempotent). Cached briefly to avoid write storms.
 */
async function ensureMultiBranchesOnPlans() {
    const now = Date.now();
    if (now - plansEnsuredAt < PLANS_TTL_MS) return;
    plansEnsuredAt = now;

    await runAsPlatform(async () => {
        await Feature.findOneAndUpdate(
            { key: MULTI },
            { $setOnInsert: FEATURE_META },
            { upsert: true }
        );

        await Plan.updateMany(
            { key: { $in: TIER_KEYS }, features: { $ne: MULTI } },
            { $addToSet: { features: MULTI } }
        );
    }, { reason: "ensure_multi_branches_on_plans" });
}

/**
 * If this tenant is on Gold/Platinum but still missing multi_branches
 * (e.g. lifetime feature snapshot taken before the feature existed),
 * add it via featureOverrides.add so effectiveFeatures includes it.
 */
async function ensureTenantMultiBranches(tenant, plan) {
    if (!tenant || !plan) return tenant;
    const key = String(plan.key || "").toLowerCase();
    if (!TIER_KEYS.includes(key)) return tenant;

    await ensureMultiBranchesOnPlans();

    // Re-read plan features after possible plan patch
    let planDoc = plan;
    if (!Array.isArray(plan.features) || !plan.features.includes(MULTI)) {
        planDoc = await runAsPlatform(async () => Plan.findById(plan._id || plan.id).lean());
        if (!planDoc) planDoc = plan;
    }

    const effective = getEffectiveFeatures(tenant, planDoc);
    if (effective.includes(MULTI)) {
        // Attach refreshed plan features for callers that reuse the object
        if (planDoc.features && tenant.planId && typeof tenant.planId === "object") {
            tenant.planId.features = planDoc.features;
        }
        return tenant;
    }

    const add = new Set(tenant.featureOverrides?.add || []);
    if (add.has(MULTI)) return tenant;
    add.add(MULTI);
    tenant.featureOverrides = {
        add: Array.from(add),
        remove: tenant.featureOverrides?.remove || [],
    };
    tenant.markModified("featureOverrides");

    await runAsPlatform(async () => {
        await tenant.save();
    }, { reason: "ensure_tenant_multi_branches_override" });

    return tenant;
}

module.exports = {
    ensureMultiBranchesOnPlans,
    ensureTenantMultiBranches,
    MULTI_BRANCHES_FEATURE: MULTI,
};
