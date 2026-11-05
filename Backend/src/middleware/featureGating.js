const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const { getEffectiveFeatures, getEffectiveLimits } = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");

/**
 * Middleware that verifies the active tenant's subscription plan (and overrides)
 * includes the specified featureKey.
 * Runs BEFORE the RBAC authorizer.
 * Returns HTTP 403 with code FEATURE_NOT_IN_PLAN if forbidden.
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

            // Retrieve tenant and plan (cached on req if previously loaded in request)
            if (!req.tenant) {
                const tenant = await runAsPlatform(async () => {
                    return await Tenant.findById(tenantId).populate("planId");
                });

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
                req.plan = tenant.planId;
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
