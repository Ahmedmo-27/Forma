const express = require("express");
const router = express.Router();
const { requireFeature } = require("../middleware/featureGating");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
} = require("../controllers/notificationController");

router.use(protect, authorizeRoles("Sales", "Sales Manager", "Accountant", "Coach", "Head Coach", "Owner", "General Manager"));
router.use(requireFeature("notifications"));

router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

module.exports = router;
