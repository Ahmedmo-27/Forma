const Plan = require("../models/Plan");
const { FEATURES, FEATURE_KEYS } = require("../config/featureRegistry");
const { runAsPlatform } = require("../context/tenantContext");

let cache = { at: 0, byFeature: null, plans: null };
const CACHE_TTL_MS = 60_000;

function isPublicPlan(plan) {
    if (!plan || plan.isActive === false) return false;
    const visibility = plan.visibility || "public";
    return visibility !== "hidden" && visibility !== "archived";
}

function planRank(plan) {
    const order = Number.isFinite(plan.sortOrder) ? plan.sortOrder : 9999;
    const monthly = Number.isFinite(plan.priceMonthly) ? plan.priceMonthly : Number.MAX_SAFE_INTEGER;
    return { order, monthly };
}

/**
 * Map each feature key → cheapest public plan that includes it.
 * Prefer lower sortOrder, then lower monthly price.
 */
async function buildFeaturePlanMap({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache.byFeature && now - cache.at < CACHE_TTL_MS) {
        return cache;
    }

    const plans = await runAsPlatform(
        () =>
            Plan.find({
                isActive: { $ne: false },
                visibility: { $nin: ["hidden", "archived"] },
            })
                .select("key name features sortOrder priceMonthly visibility isActive")
                .lean(),
        { reason: "feature_plan_lookup" }
    );

    const publicPlans = (plans || []).filter(isPublicPlan).sort((a, b) => {
        const ra = planRank(a);
        const rb = planRank(b);
        if (ra.order !== rb.order) return ra.order - rb.order;
        return ra.monthly - rb.monthly;
    });

    const byFeature = new Map();
    for (const plan of publicPlans) {
        const features = Array.isArray(plan.features) ? plan.features : [];
        for (const key of features) {
            if (!byFeature.has(key)) {
                byFeature.set(key, { key: plan.key, name: plan.name });
            }
        }
    }

    cache = { at: now, byFeature, plans: publicPlans };
    return cache;
}

function invalidateFeaturePlanLookupCache() {
    cache = { at: 0, byFeature: null, plans: null };
}

async function getPlanForFeature(featureKey) {
    const { byFeature } = await buildFeaturePlanMap();
    return byFeature.get(featureKey) || null;
}

/**
 * Locked catalog for a tenant: registry features not in effectiveFeatures,
 * each annotated with the cheapest public plan that includes them.
 */
async function buildLockedFeatureCatalog(effectiveFeatures = []) {
    const enabled = new Set(effectiveFeatures || []);
    const { byFeature } = await buildFeaturePlanMap();

    return FEATURES.filter((f) => FEATURE_KEYS.includes(f.key) && !enabled.has(f.key)).map((f) => ({
        key: f.key,
        name: f.name,
        description: f.description || "",
        category: f.category || "core",
        availableOnPlan: byFeature.get(f.key) || null,
    }));
}

function activeFeatureTrials(tenant, now = new Date()) {
    const trials = Array.isArray(tenant?.featureTrials) ? tenant.featureTrials : [];
    return trials
        .filter((t) => t?.featureKey && t?.endsAt && new Date(t.endsAt) > now)
        .map((t) => ({
            featureKey: t.featureKey,
            startsAt: t.startsAt || null,
            endsAt: t.endsAt,
            requestId: t.requestId || null,
        }));
}

module.exports = {
    buildFeaturePlanMap,
    getPlanForFeature,
    buildLockedFeatureCatalog,
    activeFeatureTrials,
    invalidateFeaturePlanLookupCache,
};
