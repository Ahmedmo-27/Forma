const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");

function isPopulatedPlan(plan) {
    return Boolean(plan && Array.isArray(plan.features));
}

async function loadTenantWithPlan(tenantId) {
    return runAsPlatform(async () => {
        return Tenant.findById(tenantId).populate("planId");
    });
}

/**
 * Middleware that verifies the active tenant's subscription plan (and overrides)
 * includes the specified featureKey.
 * Runs BEFORE the RBAC authorizer.
 * Returns HTTP 403 with code FEATURE_NOT_IN_PLAN if forbidden.
 *
 * Auth attaches the tenant before this middleware, but it used to do so without
 * populating planId and without setting req.plan. Checking features in that
 * state treats every plan as having no features.
 *
 * @param {string} featureKey
 */
function requireFeature(featureKey) {
    return async (req, res, next) => {
        try {
            const tenantId = req.user?.tenantId;
            if (!tenantId) {
                // If route is platform or unauthenticated, feature gating doesn't apply directly
                return next();
            }

            if (!req.tenant || !isPopulatedPlan(req.plan)) {
                const tenant = await loadTenantWithPlan(tenantId);

                if (!tenant) {
                    const message = "Gym subscription not found.";
                    return res.status(404).json({
                        error: {
                            code: "TENANT_NOT_FOUND",
                            message,
                            status: 404,
                            requestId: req.requestId,
                        },
                        code: "TENANT_NOT_FOUND",
                        message,
                    });
                }

                req.tenant = tenant;
                req.plan = isPopulatedPlan(tenant.planId) ? tenant.planId : null;
            }

            const effectiveFeatures = getEffectiveFeatures(req.tenant, req.plan);
            if (!effectiveFeatures.includes(featureKey)) {
                const message = `The '${featureKey}' feature is not enabled for your gym's current subscription plan. Please upgrade to access this feature.`;
                return res.status(403).json({
                    error: {
                        code: "FEATURE_NOT_IN_PLAN",
                        message,
                        status: 403,
                        requestId: req.requestId,
                        details: { feature: featureKey },
                    },
                    code: "FEATURE_NOT_IN_PLAN",
                    feature: featureKey,
                    message,
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { requireFeature };
