const User = require("../models/User");
const Member = require("../models/Member");

/**
 * Oldest sales manager in the gym is the primary assignee.
 * When several exist, createdAt then _id keeps the choice stable.
 */
async function primarySalesManager() {
    return User.findOne({ role: "Sales Manager" })
        .sort({ createdAt: 1, _id: 1 })
        .select("_id name");
}

async function resolveSalesAssignee(assignedSales) {
    if (assignedSales) return assignedSales;
    const manager = await primarySalesManager();
    return manager?._id || null;
}

/** Members with no sales rep belong to the primary sales manager. */
async function assignOpenMembersToSalesManager() {
    const manager = await primarySalesManager();
    if (!manager) return { managerId: null, updated: 0 };
    const result = await Member.updateMany(
        { $or: [{ assignedSales: null }, { assignedSales: { $exists: false } }] },
        { $set: { assignedSales: manager._id } }
    );
    return { managerId: manager._id, updated: result.modifiedCount || 0 };
}

module.exports = {
    primarySalesManager,
    resolveSalesAssignee,
    assignOpenMembersToSalesManager,
};
