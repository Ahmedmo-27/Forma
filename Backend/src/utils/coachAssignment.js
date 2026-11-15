const User = require("../models/User");
const Member = require("../models/Member");

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

module.exports = {
    primaryHeadCoach,
    resolveCoachAssignee,
    assignOpenMembersToHeadCoach,
};
