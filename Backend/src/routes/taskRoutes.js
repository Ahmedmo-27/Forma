const express = require("express");
const router = express.Router();
const {
    getCreatedTasks,
    getAssignedTasks,
    getAssignedHistory,
    completeMemberTask,
} = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { autoInvalidate } = require("../utils/cacheInvalidator");

router.use(protect);

// Assigner history of created tasks
router.get("/created", allowRoles("transfer", "coach_transfer", "Sales Manager", "Coach Manager", "Owner", "General Manager"), getCreatedTasks);

// Assignee active tasks
router.get("/assigned", allowRoles("Sales", "Coach", "Sales Manager", "Coach Manager", "Owner", "General Manager"), getAssignedTasks);

// Assignee history of people assigned to them
router.get("/history", allowRoles("Sales", "Coach", "Sales Manager", "Coach Manager", "Owner", "General Manager"), getAssignedHistory);

// Mark a member as completed
router.patch("/:taskId/members/:memberId/complete", autoInvalidate(["members"]), completeMemberTask);

module.exports = router;
