const express = require("express");
const router = express.Router();
const { requireFeature } = require("../middleware/featureGating");
const { protect } = require("../middleware/authMiddleware");
const {
    listAnnouncements,
    dismissAnnouncement,
    dismissAllAnnouncements,
} = require("../controllers/announcementController");

router.use(protect);
router.use(requireFeature("notifications"));

router.get("/", listAnnouncements);
router.post("/dismiss-all", dismissAllAnnouncements);
router.post("/:id/dismiss", dismissAnnouncement);

module.exports = router;
