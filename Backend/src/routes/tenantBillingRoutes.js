const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
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

router.use(protect);

// GET /api/tenant/billing/prices - accessible to all authenticated staff
router.get("/prices", getPlanPrices);

// POST /api/tenant/billing/lifetime/checkout - Owner only
router.post(
    "/lifetime/checkout",
    authorize("Owner"),
    validate(lifetimeCheckoutSchema),
    checkoutLifetime
);

// POST /api/tenant/billing/lifetime/confirm - Owner only
router.post(
    "/lifetime/confirm",
    authorize("Owner"),
    confirmLifetimePurchase
);

// POST /api/tenant/billing/lifetime/upgrade - Owner only
router.post(
    "/lifetime/upgrade",
    authorize("Owner"),
    validate(lifetimeUpgradeSchema),
    upgradeLifetime
);

module.exports = router;
