const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    listAnnouncements,
    dismissAnnouncement,
    dismissAllAnnouncements,
} = require("../controllers/announcementController");

router.use(protect);

router.get("/", listAnnouncements);
router.post("/dismiss-all", dismissAllAnnouncements);
router.post("/:id/dismiss", dismissAnnouncement);

module.exports = router;
