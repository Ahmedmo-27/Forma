const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const {
    createStaffIdentityRequest,
    listMine,
} = require("../controllers/staffIdentityRequestController");

router.use(protect);
router.use(enforceSubscriptionStatus);

router.get("/mine", listMine);
router.post("/", createStaffIdentityRequest);

module.exports = router;
