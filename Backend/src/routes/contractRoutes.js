const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles, requireAccess } = require("../middleware/accessMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { cacheResponse } = require("../middleware/apiCache");
const { locationScopeOptional } = require("../middleware/locationScope");
const { getContracts } = require("../controllers/contractController");

router.use(protect);
router.use(requireFeature("accounting"));
router.use(requireAccess("accounting"));
router.use(locationScopeOptional);

router.get("/contracts", allowRoles("contracts", "Accountant", "Owner", "Sales Manager"), cacheResponse({ ttlSeconds: 120, tags: ["contracts"] }), getContracts);

module.exports = router;
