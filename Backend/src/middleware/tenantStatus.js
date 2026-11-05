const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const User = require("../models/User");
const { getEffectiveLimits } = require("../models/Tenant");
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
                return res.status(404).json({
                    code: "TENANT_NOT_FOUND",
                    message: "Gym subscription not found.",
                });
            }
            req.tenant = tenant;
            req.plan = tenant.planId;
        }

        const tenant = req.tenant;
        const now = new Date();

        if (tenant.status === "suspended" || tenant.status === "cancelled") {
            return res.status(403).json({
                code: "TENANT_SUSPENDED",
                message: `This gym is currently ${tenant.status}. Access is restricted.`,
            });
        }

        if (tenant.status === "trial" && tenant.trialEndsAt && new Date(tenant.trialEndsAt) < now) {
            return res.status(403).json({
                code: "TRIAL_EXPIRED",
                message: "Your trial period has ended. Please choose a subscription plan to continue.",
            });
        }

        if (tenant.status === "past_due") {
            const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase());
            if (isMutation) {
                return res.status(403).json({
                    code: "SUBSCRIPTION_PAST_DUE",
                    message: "Your subscription payment is past due. Read-only mode is active until payment is settled.",
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
                return res.status(403).json({
                    code: "PLAN_LIMIT_REACHED",
                    limit: "maxMembers",
                    current: currentCount,
                    max: limits.maxMembers,
                    message: `You have reached your plan limit of ${limits.maxMembers} members. Upgrade your plan to add more.`,
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

        // 1. Role validation against allowedRoles
        const requestedRole = req.body?.role;
        const allowedRoles = req.plan?.allowedRoles || [];
        if (requestedRole && allowedRoles.length > 0 && !allowedRoles.includes(requestedRole)) {
            return res.status(403).json({
                code: "ROLE_NOT_IN_PLAN",
                role: requestedRole,
                allowedRoles,
                message: `The '${requestedRole}' role is not permitted under your current ${req.plan?.name || "subscription"} plan.`,
            });
        }

        // 2. Staff count limit check
        const limits = getEffectiveLimits(req.tenant, req.plan);
        if (limits.maxStaff != null) {
            const currentCount = await User.countDocuments();
            if (currentCount >= limits.maxStaff) {
                return res.status(403).json({
                    code: "PLAN_LIMIT_REACHED",
                    limit: "maxStaff",
                    current: currentCount,
                    max: limits.maxStaff,
                    message: `You have reached your plan limit of ${limits.maxStaff} staff members. Upgrade your plan to invite more staff.`,
                });
            }
        }
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    enforceSubscriptionStatus,
    enforceMemberLimit,
    enforceStaffLimit,
};
