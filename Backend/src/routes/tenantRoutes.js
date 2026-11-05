const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { tenantSettingsSchema } = require("../validation/schemas");
const { uploadSinglePhoto } = require("../config/multer");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    getMyTenant,
    updateMyTenantSettings,
    uploadTenantLogo,
} = require("../controllers/tenantController");
const tenantBillingRoutes = require("./tenantBillingRoutes");

router.use("/billing", tenantBillingRoutes);

router.use(protect);

// GET /api/tenant/me — accessible to all authenticated staff
router.get("/me", cacheResponse({ ttlSeconds: 300, tags: ["tenant"] }), getMyTenant);

// PATCH /api/tenant/me — Owner only
router.patch("/me", authorize("Owner"), validate(tenantSettingsSchema), autoInvalidate(["tenant"]), updateMyTenantSettings);

// POST /api/tenant/me/logo — Owner only
router.post("/me/logo", authorize("Owner"), uploadSinglePhoto("logoFile"), autoInvalidate(["tenant"]), uploadTenantLogo);

module.exports = router;
