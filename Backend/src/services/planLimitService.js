const mongoose = require("mongoose");
const { getEffectiveLimits } = require("../models/Tenant");
const { runWithTenant, runAsPlatform } = require("../context/tenantContext");

const COUNTED_LIMITS = [
    { limit: "maxMembers", usage: "members", noun: "members" },
    { limit: "maxStaff", usage: "staff", noun: "staff accounts" },
    { limit: "maxBranches", usage: "branches", noun: "branches" },
];

/** Same counts the create-time guards use (members, staff users, locations). */
async function countTenantUsage(tenantId) {
    if (mongoose.connection.readyState !== 1) return { members: 0, staff: 0, branches: 0 };
    const Member = require("../models/Member");
    const User = require("../models/User");
    const Location = require("../models/Location");
    const [members, staff, branches] = await runWithTenant({ tenantId: String(tenantId) }, () =>
        Promise.all([Member.countDocuments(), User.countDocuments(), Location.countDocuments()])
    );
    return { members, staff, branches };
}

/** Limits a tenant currently exceeds. A missing or non-positive cap means no cap. */
function findOverages(limits = {}, usage = {}) {
    const overages = [];
    for (const { limit, usage: key, noun } of COUNTED_LIMITS) {
        const max = Number(limits[limit]);
        if (!Number.isFinite(max) || max <= 0) continue;
        const current = Number(usage[key]) || 0;
        if (current > max) {
            overages.push({ limit, noun, current, max, excess: current - max });
        }
    }
    return overages;
}

function describeOverages(overages) {
    return overages.map((o) => `${o.current} ${o.noun} (limit ${o.max})`).join(", ");
}

/**
 * What the tenant would exceed after switching to `plan` and/or new limit overrides.
 * Pass `usage` to skip the count queries.
 */
async function assessLimitChange(tenant, { plan, limitOverrides, usage } = {}) {
    const nextTenant = {
        limitOverrides: limitOverrides !== undefined ? limitOverrides : tenant.limitOverrides,
    };
    const limits = getEffectiveLimits(nextTenant, plan);
    const counts = usage || (await countTenantUsage(tenant._id));
    return { limits, usage: counts, overages: findOverages(limits, counts) };
}

/**
 * Room left under one counted limit, or null when the plan has no cap for it.
 * `remaining` is never negative, so an over-cap gym reports 0.
 */
async function remainingCapacity(tenantId, limit) {
    const entry = COUNTED_LIMITS.find((item) => item.limit === limit);
    if (!entry) throw new Error(`Unknown counted limit: ${limit}`);
    const Tenant = require("../models/Tenant");
    const tenant = await runAsPlatform(() => Tenant.findById(tenantId).populate("planId"));
    if (!tenant) return null;
    const max = Number(getEffectiveLimits(tenant, tenant.planId)[limit]);
    if (!Number.isFinite(max) || max <= 0) return null;
    const usage = await countTenantUsage(tenantId);
    const current = usage[entry.usage];
    return { limit, noun: entry.noun, max, current, remaining: Math.max(0, max - current) };
}

/** Same response shape as the create-time limit middleware. */
function planLimitPayload({ limit, current, max, message, requestId }) {
    return {
        error: {
            code: "PLAN_LIMIT_REACHED",
            message,
            status: 403,
            requestId,
            details: { limit, current, max },
        },
        code: "PLAN_LIMIT_REACHED",
        limit,
        current,
        max,
        message,
    };
}

/**
 * Builds the 409 body used when a downgrade would leave the gym over its caps.
 * Callers resend with `force: true` to apply it anyway.
 */
function overLimitResponse(overages, planName) {
    return {
        code: "PLAN_DOWNGRADE_OVER_LIMIT",
        message: `This gym would exceed ${planName ? `the ${planName} plan's` : "its new"} limits: ${describeOverages(overages)}. Ask the owner to remove the extra records, or confirm to apply anyway. New records stay blocked until usage is back under the cap.`,
        details: { overages },
    };
}

module.exports = {
    COUNTED_LIMITS,
    countTenantUsage,
    findOverages,
    describeOverages,
    assessLimitChange,
    remainingCapacity,
    planLimitPayload,
    overLimitResponse,
};
