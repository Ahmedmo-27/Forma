const Tenant = require("../../models/Tenant");
const logger = require("../../utils/logger");
const { runAsPlatform } = require("../../context/tenantContext");

/**
 * Tenant Lifecycle Background Service
 * Handles trial expiration and renewal grace periods.
 *
 * CRITICAL SAFETY INVARIANT:
 * Lifetime tenants ("billing.cycle === 'lifetime'") MUST NEVER BE EXPIRED OR DOWNGRADED.
 */
async function processTenantExpiryCycles(now = new Date()) {
    return runAsPlatform(async () => {
        try {
            // 1. Expire trials: ONLY for non-lifetime tenants
            const expiredTrialResult = await Tenant.updateMany(
                {
                    status: "trial",
                    "billing.cycle": { $ne: "lifetime" },
                    trialEndsAt: { $lt: now, $ne: null },
                },
                {
                    $set: { status: "suspended" },
                }
            );

            // 2. Mark overdue active subscriptions as past_due: ONLY for non-lifetime tenants
            const overdueSubResult = await Tenant.updateMany(
                {
                    status: "active",
                    "billing.cycle": { $ne: "lifetime" },
                    currentPeriodEnd: { $lt: now, $ne: null },
                },
                {
                    $set: { status: "past_due" },
                }
            );

            return {
                expiredTrials: expiredTrialResult.modifiedCount || 0,
                overdueSubscriptions: overdueSubResult.modifiedCount || 0,
            };
        } catch (error) {
            logger.error("tenantLifecycle", "Failed to process tenant expiry cycles", { error: error.message });
            throw error;
        }
    }, { reason: "scheduled_tenant_expiry_cycle" });
}

module.exports = {
    processTenantExpiryCycles,
};
