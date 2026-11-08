const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    lifetimeCheckoutSchema,
    lifetimeUpgradeSchema,
} = require("../validation/schemas");
const {
    getPlanPrices,
    checkoutLifetime,
    confirmLifetimePurchase,
    upgradeLifetime,
} = require("../controllers/tenantBillingController");

const priceCache = cacheResponse({ ttlSeconds: 120, tags: ["billing"] });
const dropPrices = autoInvalidate(["billing"]);

router.use(protect);

// GET /api/tenant/billing/prices - accessible to all authenticated staff
router.get("/prices", priceCache, getPlanPrices);

// POST /api/tenant/billing/lifetime/checkout - Owner only
router.post(
    "/lifetime/checkout",
    authorize("Owner"),
    validate(lifetimeCheckoutSchema),
    checkoutLifetime
);

// Confirm and upgrade reserve a lifetime seat on PlanPrice.
router.post(
    "/lifetime/confirm",
    authorize("Owner"),
    dropPrices,
    confirmLifetimePurchase
);

// POST /api/tenant/billing/lifetime/upgrade - Owner only
router.post(
    "/lifetime/upgrade",
    authorize("Owner"),
    validate(lifetimeUpgradeSchema),
    dropPrices,
    upgradeLifetime
);

module.exports = router;
