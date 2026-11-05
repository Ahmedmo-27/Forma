const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { tenantSettingsSchema } = require("../validation/schemas");
const {
    getMyTenant,
    updateMyTenantSettings,
} = require("../controllers/tenantController");

router.use(protect);

// GET /api/tenant/me — accessible to all authenticated staff
router.get("/me", getMyTenant);

// PATCH /api/tenant/me — Owner only
router.patch("/me", authorize("Owner"), validate(tenantSettingsSchema), updateMyTenantSettings);

module.exports = router;
