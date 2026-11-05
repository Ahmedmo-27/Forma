const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { getContracts } = require("../controllers/contractController");

router.use(protect);
router.use(requireFeature("accounting"));

router.get("/contracts", authorize("Accountant", "Owner", "Sales Manager"), getContracts);

module.exports = router;
