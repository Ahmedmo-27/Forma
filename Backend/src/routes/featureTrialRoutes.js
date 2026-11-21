const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const {
    listMine,
    createRequest,
    cancelRequest,
} = require("../controllers/featureTrialController");

router.use(protect);

router.get("/mine", listMine);

router.use(enforceSubscriptionStatus);
router.post("/", createRequest);
router.post("/:id/cancel", cancelRequest);

module.exports = router;
