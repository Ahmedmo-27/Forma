const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { cacheResponse } = require("../middleware/apiCache");
const { getPlanPrices } = require("../controllers/tenantBillingController");

const priceCache = cacheResponse({ ttlSeconds: 120, tags: ["billing"] });

router.use(protect);

// GET /api/tenant/billing/prices - accessible to all authenticated staff
router.get("/prices", priceCache, getPlanPrices);

module.exports = router;
