const express = require("express");
const router = express.Router();
const {
    getCreatedTasks,
    getAssigningOverview,
    getAssignedTasks,
    getAssignedHistory,
    completeMemberTask,
} = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles, allowAnyFeature } = require("../middleware/accessMiddleware");
const { autoInvalidate } = require("../utils/cacheInvalidator");

router.use(protect);

// ============================================================================
// 1. ASSIGNING PLAYER ROUTES (Player Type: Assigning)
// Strictly for Sales Manager, Coach Manager, Owner, General Manager,
// or staff with explicit "transfer" / "coach_transfer" permissions.
// Regular Sales and Coaches are NOT authorized on these endpoints.
// ============================================================================
const assigningGuard = allowAnyFeature(["transfer", "coach_transfer"], "Sales Manager", "Coach Manager", "Owner", "General Manager");

// History & list of tasks created by the manager
router.get("/assigning/created", assigningGuard, getCreatedTasks);
router.get("/assigning/history", assigningGuard, getCreatedTasks);

// Overview metrics of created assignments (progress, counts, completion rate)
router.get("/assigning/overview", assigningGuard, getAssigningOverview);

// ============================================================================
// 2. ASSIGNED PLAYER ROUTES (Player Type: Assigned)
// For regular Sales and Coaches (and managers with assigned tasks).
// Zero privilege requirement beyond their core assigned role.
// ============================================================================
const assignedGuard = allowAnyFeature(["sales_members", "coach_members", "transfer", "coach_transfer"], "Sales", "Coach", "Sales Manager", "Coach Manager", "Owner", "General Manager");

// Active tasks assigned to the caller
router.get("/assigned/active", assignedGuard, getAssignedTasks);

// Complete history of members assigned to the caller
router.get("/assigned/history", assignedGuard, getAssignedHistory);

// Mark an assigned member task as completed
router.patch("/assigned/:taskId/members/:memberId/complete", assignedGuard, autoInvalidate(["members"]), completeMemberTask);

// ============================================================================
// 3. BACKWARD-COMPATIBILITY ALIASES
// Kept to ensure uninterrupted operation for existing callers.
// ============================================================================
router.get("/created", assigningGuard, getCreatedTasks);
router.get("/assigned", assignedGuard, getAssignedTasks);
router.get("/history", assignedGuard, getAssignedHistory);
router.patch("/:taskId/members/:memberId/complete", assignedGuard, autoInvalidate(["members"]), completeMemberTask);

module.exports = router;
