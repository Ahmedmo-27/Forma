const Task = require("../models/Task");
const Member = require("../models/Member");
const { parsePagination, buildPagination } = require("../utils/pagination");

// 1. Get tasks created by the current user (or all created tasks for Owner / GM)
const getCreatedTasks = async (req, res) => {
    try {
        const filter = {};
        const isSuper = ["Owner", "General Manager"].includes(req.user.role);

        if (!isSuper || req.query.onlyMine === "true") {
            filter.createdBy = req.user.id;
        }

        if (req.query.assignedTo && req.query.assignedTo !== "all") {
            filter.assignedTo = req.query.assignedTo;
        }
        if (req.query.targetRole && req.query.targetRole !== "all") {
            if (req.query.targetRole === "Sales") {
                filter.targetRole = { $in: ["Sales", "Sales Manager"] };
            } else if (req.query.targetRole === "Coach") {
                filter.targetRole = { $in: ["Coach", "Coach Manager"] };
            } else {
                filter.targetRole = req.query.targetRole;
            }
        }
        if (req.query.status && req.query.status !== "all") {
            filter.status = req.query.status;
        }
        if (req.query.transferType && req.query.transferType !== "all") {
            filter.transferType = req.query.transferType;
        }

        if (req.query.dateFrom || req.query.dateTo) {
            filter.createdAt = {};
            if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const end = new Date(req.query.dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const tasks = await Task.find(filter)
            .populate("createdBy", "name role")
            .populate("assignedTo", "name role")
            .populate("members.completedBy", "name role")
            .populate({
                path: "members.member",
                select: "name systemId memberId phones status subscriptions",
                populate: { path: "subscriptions.package", select: "name" },
            })
            .sort({ createdAt: -1 });

        res.json({ tasks });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 2. Get tasks assigned to the current user (Sales / Coach)
const getAssignedTasks = async (req, res) => {
    try {
        const filter = { assignedTo: req.user.id };

        if (req.query.status && req.query.status !== "all") {
            filter.status = req.query.status;
        }

        const tasks = await Task.find(filter)
            .populate("createdBy", "name role")
            .populate("assignedTo", "name role")
            .populate("members.completedBy", "name role")
            .populate({
                path: "members.member",
                select: "name systemId memberId phones status subscriptions",
                populate: { path: "subscriptions.package", select: "name" },
            })
            .sort({ createdAt: -1 });

        res.json({ tasks });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 3. Get history of people assigned to the user
const getAssignedHistory = async (req, res) => {
    try {
        const targetUserId = req.query.personId && ["Owner", "General Manager", "Sales Manager", "Coach Manager"].includes(req.user.role)
            ? req.query.personId
            : req.user.id;

        const tasks = await Task.find({ assignedTo: targetUserId })
            .populate("createdBy", "name role")
            .populate("assignedTo", "name role")
            .populate("members.completedBy", "name role")
            .populate({
                path: "members.member",
                select: "name systemId memberId phones status subscriptions",
                populate: { path: "subscriptions.package", select: "name" },
            })
            .sort({ createdAt: -1 });

        const history = [];
        tasks.forEach((task) => {
            (task.members || []).forEach((item) => {
                const memberRef = item.member && typeof item.member === "object" ? item.member : null;
                const sub = memberRef?.subscriptions && memberRef.subscriptions.length
                    ? memberRef.subscriptions[memberRef.subscriptions.length - 1]
                    : null;
                const pkgName = sub?.package?.name || (typeof sub?.package === "string" ? sub.package : null);
                const pkgId = sub?.package?._id ? sub.package._id.toString() : (sub?.package ? String(sub.package) : null);

                history.push({
                    _id: item._id,
                    taskId: task._id,
                    taskTitle: task.title,
                    transferType: task.transferType,
                    targetRole: task.targetRole,
                    assignedAt: task.createdAt,
                    assignedBy: {
                        _id: task.createdBy?._id,
                        name: task.createdBy?.name || "Manager",
                        role: task.createdBy?.role || null,
                    },
                    assignedTo: {
                        _id: task.assignedTo?._id,
                        name: task.assignedTo?.name,
                        role: task.assignedTo?.role,
                    },
                    member: {
                        _id: memberRef?._id || item.member,
                        name: item.name || memberRef?.name || "Member",
                        systemId: item.systemId ?? memberRef?.systemId ?? "",
                        phone: item.phone || memberRef?.phones || "",
                        status: memberRef?.status || "active",
                        package: pkgName,
                        packageId: pkgId,
                        startDate: sub?.startDate || null,
                        endDate: sub?.endDate || null,
                    },
                    status: item.status,
                    completedAt: item.completedAt,
                    completedBy: item.completedBy ? {
                        _id: item.completedBy._id,
                        name: item.completedBy.name,
                        role: item.completedBy.role,
                    } : null,
                    notes: item.notes || "",
                });
            });
        });

        // Sort: completed first by completedAt descending, then pending by assignedAt descending
        history.sort((a, b) => {
            const timeA = new Date(a.completedAt || a.assignedAt).getTime();
            const timeB = new Date(b.completedAt || b.assignedAt).getTime();
            return timeB - timeA;
        });

        res.json({ history });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 3.1 Get overview stats for the assigning player (Sales Manager, Coach Manager, Owner, GM)
const getAssigningOverview = async (req, res) => {
    try {
        const filter = {};
        const isSuper = ["Owner", "General Manager"].includes(req.user.role);

        if (!isSuper || req.query.onlyMine === "true") {
            filter.createdBy = req.user.id;
        }

        const tasks = await Task.find(filter)
            .select("status totalCount completedCount assignedTo targetRole createdAt");

        let totalMembersAssigned = 0;
        let totalMembersCompleted = 0;
        let pendingTasks = 0;
        let completedTasks = 0;

        tasks.forEach((t) => {
            totalMembersAssigned += (t.totalCount || 0);
            totalMembersCompleted += (t.completedCount || 0);
            if (t.status === "completed") {
                completedTasks += 1;
            } else {
                pendingTasks += 1;
            }
        });

        res.json({
            stats: {
                totalTasks: tasks.length,
                pendingTasks,
                completedTasks,
                totalMembersAssigned,
                totalMembersCompleted,
                completionRate: totalMembersAssigned > 0
                    ? Math.round((totalMembersCompleted / totalMembersAssigned) * 100)
                    : 0,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 4. Mark member as completed in a task
const completeMemberTask = async (req, res) => {
    try {
        const { taskId, memberId } = req.params;

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        const isAssignee = task.assignedTo.toString() === req.user.id.toString();
        const isManager = ["Owner", "General Manager", "Sales Manager", "Coach Manager"].includes(req.user.role);

        if (!isAssignee && !isManager) {
            return res.status(403).json({ message: "Not authorized to update this task" });
        }

        const item = task.members.find(
            (m) => m._id.toString() === memberId || (m.member && m.member.toString() === memberId)
        );

        if (!item) {
            return res.status(404).json({ message: "Member not found in this task" });
        }

        const completedTimestamp = new Date();
        item.status = "completed";
        item.completedAt = completedTimestamp;
        item.completedBy = req.user.id;

        task.completedCount = task.members.filter((m) => m.status === "completed").length;
        task.status = task.completedCount === task.members.length ? "completed" : "in_progress";

        await task.save();

        // Also record in Member userlog audit trail
        if (item.member) {
            const memberDoc = await Member.findById(item.member);
            if (memberDoc) {
                memberDoc.userlog.push({
                    type: "task_completed",
                    text: `Task marked as completed by ${req.user.name} (${req.user.role}) on ${completedTimestamp.toISOString()}`,
                    createdBy: req.user.id,
                    createdAt: completedTimestamp,
                });
                await memberDoc.save();
            }
        }

        res.json({
            message: "Member task marked as completed",
            task,
            completedItem: item,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = {
    getCreatedTasks,
    getAssigningOverview,
    getAssignedTasks,
    getAssignedHistory,
    completeMemberTask,
};
