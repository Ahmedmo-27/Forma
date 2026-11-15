const User = require("../models/User");
const Member = require("../models/Member");
const { getTenantId } = require("../context/tenantContext");

const recentCoachAssign = new Map();
const ASSIGN_INTERVAL_MS = 15_000;

/**
 * Oldest head coach in the gym is the primary assignee.
 * When several exist, createdAt then _id keeps the choice stable.
 */
async function primaryHeadCoach() {
    return User.findOne({ role: "Head Coach" })
        .sort({ createdAt: 1, _id: 1 })
        .select("_id name email role");
}

async function resolveCoachAssignee(coachId) {
    if (coachId) return coachId;
    const headCoach = await primaryHeadCoach();
    return headCoach?._id || null;
}

/** Members with no coach belong to the primary head coach. */
async function assignOpenMembersToHeadCoach(options = {}) {
    const isDryRun = Boolean(options.dryRun || options.isDryRun);
    let headCoach = null;
    if (options.coachId) {
        headCoach = await User.findById(options.coachId).select("_id name email role");
    } else if (options.coachEmail) {
        headCoach = await User.findOne({ email: options.coachEmail.toLowerCase().trim() }).select("_id name email role");
    } else {
        headCoach = await primaryHeadCoach();
    }

    const unassignedFilter = {
        $or: [{ current_couch: null }, { current_couch: { $exists: false } }],
    };

    const unassignedCount = await Member.countDocuments(unassignedFilter);

    if (!headCoach) {
        return {
            coachId: null,
            coach: null,
            unassignedCount,
            updated: 0,
            reason: "NO_HEAD_COACH",
        };
    }

    if (isDryRun || unassignedCount === 0) {
        return {
            coachId: headCoach._id,
            coach: headCoach,
            unassignedCount,
            updated: isDryRun ? unassignedCount : 0,
            isDryRun,
        };
    }

    const result = await Member.updateMany(unassignedFilter, {
        $set: { current_couch: headCoach._id, couch_subscription_status: "active" },
    });

    return {
        coachId: headCoach._id,
        coach: headCoach,
        unassignedCount,
        updated: result.modifiedCount || 0,
        isDryRun: false,
    };
}

/**
 * Backfill members who still have no coach. Member lists are cached, so this
 * runs on cache misses and stays quiet for a few seconds per gym.
 */
async function ensureHeadCoachAssignments() {
    const tenantId = getTenantId() || "global";
    const now = Date.now();
    if (now - (recentCoachAssign.get(tenantId) || 0) < ASSIGN_INTERVAL_MS) {
        return { skipped: true, updated: 0 };
    }
    recentCoachAssign.set(tenantId, now);
    try {
        const result = await assignOpenMembersToHeadCoach();
        if (result.updated > 0 && getTenantId()) {
            const { invalidateTenantCache } = require("./cacheInvalidator");
            invalidateTenantCache(getTenantId(), "members");
        }
        return result;
    } catch (error) {
        recentCoachAssign.delete(tenantId);
        return { updated: 0, error: error.message };
    }
}

module.exports = {
    primaryHeadCoach,
    resolveCoachAssignee,
    assignOpenMembersToHeadCoach,
    ensureHeadCoachAssignments,
};
