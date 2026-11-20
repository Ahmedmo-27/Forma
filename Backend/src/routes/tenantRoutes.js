const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/accessMiddleware");
const { requireFeature } = require("../middleware/featureGating");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const validate = require("../middleware/validate");
const { tenantSettingsSchema, packageTransferFeeSchema } = require("../validation/schemas");
const { uploadSinglePhoto } = require("../config/multer");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");
const {
    getMyTenant,
    getOnboarding,
    updateMyTenantSettings,
    updatePackageTransferFee,
    uploadTenantLogo,
    updateRoleAccess,
} = require("../controllers/tenantController");
const tenantBillingRoutes = require("./tenantBillingRoutes");

router.use("/billing", tenantBillingRoutes);

router.use(protect);

// GET /api/tenant/me — accessible to all authenticated staff
router.get("/me", cacheResponse({ ttlSeconds: 60, tags: ["tenant"], browserCache: false }), getMyTenant);

// GET /api/tenant/onboarding — owner setup checklist
router.get(
    "/onboarding",
    allowRoles("settings", "Owner"),
    cacheResponse({ ttlSeconds: 60, tags: ["tenant", "packages", "members", "users"], browserCache: false }),
    getOnboarding
);

// Everything below changes gym data, so lifecycle limits (past due, expired trial) apply.
router.use(enforceSubscriptionStatus);

// PUT /api/tenant/access/:role — owner, or a general manager for roles other than their own
router.put("/access/:role", allowRoles("access_control", "Owner", "General Manager", "Sales Manager"), requireFeature("access_control"), autoInvalidate(["tenant", "users"]), updateRoleAccess);

// PATCH /api/tenant/me — Owner only
router.patch("/me", allowRoles("settings", "Owner"), validate(tenantSettingsSchema), autoInvalidate(["tenant"]), updateMyTenantSettings);

// PATCH /api/tenant/package-transfer-fee — Owner, Accountant, General Manager
router.patch(
    "/package-transfer-fee",
    allowRoles("package_transfers", "Owner", "Accountant", "General Manager"),
    requireFeature("accounting"),
    validate(packageTransferFeeSchema),
    autoInvalidate(["tenant"]),
    updatePackageTransferFee
);

// POST /api/tenant/me/logo — Owner only
router.post("/me/logo", allowRoles("settings", "Owner"), uploadSinglePhoto("logoFile"), autoInvalidate(["tenant"]), uploadTenantLogo);

module.exports = router;
