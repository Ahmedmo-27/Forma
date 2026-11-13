const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const User = require("../models/User");
const { getEffectiveLimits, getEffectiveRoles } = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");

/**
 * Middleware enforcing subscription lifecycle state:
 * - suspended / cancelled: blocks all mutations, returns 403
 * - trial: checks trialEndsAt expiry
 * - past_due: enforces read-only access (blocks POST, PUT, PATCH, DELETE)
 */
async function enforceSubscriptionStatus(req, res, next) {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return next();
        }

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

        const tenant = req.tenant;
        const now = new Date();

        if (tenant.status === "suspended" || tenant.status === "cancelled") {
            const message = `This gym is currently ${tenant.status}. Access is restricted.`;
            return res.status(403).json({
                error: {
                    code: "TENANT_SUSPENDED",
                    message,
                    status: 403,
                    requestId: req.requestId,
                    details: { tenantStatus: tenant.status },
                },
                code: "TENANT_SUSPENDED",
                message,
            });
        }

        // Lifetime subscribers: perpetual access, never expire by date, period-end, or past-due
        if (tenant.billing?.cycle === "lifetime" && tenant.status === "active") {
            return next();
        }

        if (tenant.status === "trial" && tenant.trialEndsAt && new Date(tenant.trialEndsAt) < now) {
            const message = "Your trial period has ended. Please choose a subscription plan to continue.";
            return res.status(403).json({
                error: {
                    code: "TRIAL_EXPIRED",
                    message,
                    status: 403,
                    requestId: req.requestId,
                    details: { trialEndsAt: tenant.trialEndsAt },
                },
                code: "TRIAL_EXPIRED",
                message,
            });
        }

        if (tenant.status === "past_due") {
            const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase());
            if (isMutation) {
                const message = "Your subscription payment is past due. Read-only mode is active until payment is settled.";
                return res.status(403).json({
                    error: {
                        code: "SUBSCRIPTION_PAST_DUE",
                        message,
                        status: 403,
                        requestId: req.requestId,
                    },
                    code: "SUBSCRIPTION_PAST_DUE",
                    message,
                });
            }
        }

        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Enforces maxMembers limit at member creation time.
 */
async function enforceMemberLimit(req, res, next) {
    try {
        if (!req.tenant) {
            const tenant = await runAsPlatform(async () => {
                return await Tenant.findById(req.user.tenantId).populate("planId");
            });
            if (!tenant) return next();
            req.tenant = tenant;
            req.plan = tenant.planId;
        }

        const limits = getEffectiveLimits(req.tenant, req.plan);
        if (limits.maxMembers != null) {
            const currentCount = await Member.countDocuments();
            if (currentCount >= limits.maxMembers) {
                const message = `You have reached your plan limit of ${limits.maxMembers} members. Upgrade your plan to add more.`;
                return res.status(403).json({
                    error: {
                        code: "PLAN_LIMIT_REACHED",
                        message,
                        status: 403,
                        requestId: req.requestId,
                        details: {
                            limit: "maxMembers",
                            current: currentCount,
                            max: limits.maxMembers,
                        },
                    },
                    code: "PLAN_LIMIT_REACHED",
                    limit: "maxMembers",
                    current: currentCount,
                    max: limits.maxMembers,
                    message,
                });
            }
        }
        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Enforces maxStaff limit and plan's allowedRoles at staff creation time.
 */
async function enforceStaffLimit(req, res, next) {
    try {
        if (!req.tenant) {
            const tenant = await runAsPlatform(async () => {
                return await Tenant.findById(req.user.tenantId).populate("planId");
            });
            if (!tenant) return next();
            req.tenant = tenant;
            req.plan = tenant.planId;
        }

        if (respondIfRoleNotInPlan(req, res, req.body?.role)) return;

        // 2. Staff count limit check
        const limits = getEffectiveLimits(req.tenant, req.plan);
        if (limits.maxStaff != null) {
            const currentCount = await User.countDocuments();
            if (currentCount >= limits.maxStaff) {
                const message = `You have reached your plan limit of ${limits.maxStaff} staff members. Upgrade your plan to invite more staff.`;
                return res.status(403).json({
                    error: {
                        code: "PLAN_LIMIT_REACHED",
                        message,
                        status: 403,
                        requestId: req.requestId,
                        details: {
                            limit: "maxStaff",
                            current: currentCount,
                            max: limits.maxStaff,
                        },
                    },
                    code: "PLAN_LIMIT_REACHED",
                    limit: "maxStaff",
                    current: currentCount,
                    max: limits.maxStaff,
                    message,
                });
            }
        }
        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Sends ROLE_NOT_IN_PLAN when the role is outside the plan plus role overrides.
 * Returns true when the response was sent.
 */
function respondIfRoleNotInPlan(req, res, requestedRole) {
    const allowedRoles = getEffectiveRoles(req.tenant, req.plan);
    if (!requestedRole || allowedRoles.length === 0 || allowedRoles.includes(requestedRole)) {
        return false;
    }

    const message = `The '${requestedRole}' role is not permitted under your current ${req.plan?.name || "subscription"} plan.`;
    res.status(403).json({
        error: {
            code: "ROLE_NOT_IN_PLAN",
            message,
            status: 403,
            requestId: req.requestId,
            details: {
                role: requestedRole,
                allowedRoles,
            },
        },
        code: "ROLE_NOT_IN_PLAN",
        role: requestedRole,
        allowedRoles,
        message,
    });
    return true;
}

module.exports = {
    enforceSubscriptionStatus,
    enforceMemberLimit,
    enforceStaffLimit,
    respondIfRoleNotInPlan,
};
