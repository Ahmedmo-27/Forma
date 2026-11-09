const User = require("../models/User");
const Member = require("../models/Member");

/**
 * Oldest sales manager in the gym is the primary assignee.
 * When several exist, createdAt then _id keeps the choice stable.
 */
async function primarySalesManager() {
    return User.findOne({ role: "Sales Manager" })
        .sort({ createdAt: 1, _id: 1 })
        .select("_id name email role");
}

async function resolveSalesAssignee(assignedSales) {
    if (assignedSales) return assignedSales;
    const manager = await primarySalesManager();
    return manager?._id || null;
}

/** Members with no sales rep belong to the primary sales manager. */
async function assignOpenMembersToSalesManager(options = {}) {
    const isDryRun = Boolean(options.dryRun || options.isDryRun);
    let manager = null;
    if (options.managerId) {
        manager = await User.findById(options.managerId).select("_id name email role");
    } else if (options.managerEmail) {
        manager = await User.findOne({ email: options.managerEmail.toLowerCase().trim() }).select("_id name email role");
    } else {
        manager = await primarySalesManager();
    }

    const unassignedFilter = {
        $or: [{ assignedSales: null }, { assignedSales: { $exists: false } }],
    };

    const unassignedCount = await Member.countDocuments(unassignedFilter);

    if (!manager) {
        return {
            managerId: null,
            manager: null,
            unassignedCount,
            updated: 0,
            reason: "NO_SALES_MANAGER",
        };
    }

    if (isDryRun || unassignedCount === 0) {
        return {
            managerId: manager._id,
            manager,
            unassignedCount,
            updated: isDryRun ? unassignedCount : 0,
            isDryRun,
        };
    }

    const result = await Member.updateMany(unassignedFilter, {
        $set: { assignedSales: manager._id },
    });

    return {
        managerId: manager._id,
        manager,
        unassignedCount,
        updated: result.modifiedCount || 0,
        isDryRun: false,
    };
}

module.exports = {
    primarySalesManager,
    resolveSalesAssignee,
    assignOpenMembersToSalesManager,
};
