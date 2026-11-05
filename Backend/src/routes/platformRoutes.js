const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate");
const { protectPlatform } = require("../middleware/platformAuth");
const { requirePlatformPermission } = require("../middleware/platformRbac");
const { PERMISSIONS } = require("../config/platformPermissions");
const { platformAuthLimiter } = require("../middleware/platformRateLimit");
const { platformIpAllowlist } = require("../middleware/ipAllowlist");

const {
    login,
    setupMfa,
    verifyEnrollment,
    challengeMfa,
    refreshToken,
    getMe,
} = require("../controllers/platformAuthController");

const {
    getPlatformUsers,
    createPlatformUser,
    updatePlatformUser,
    deletePlatformUser,
    resetUserMfa,
    revokeUserSessions,
} = require("../controllers/platformUserController");

const {
    getTenants,
    getTenantDetail,
    onboardTenant,
    updateTenantLifecycle,
    addTenantNote,
    deleteTenantNote,
    updateTenantTags,
    bulkTenantActions,
} = require("../controllers/platformTenantController");
const {
    getFeatures,
    createFeature,
    updateFeature,
    getPlans,
    createPlan,
    getPlanImpactPreview,
    updatePlan,
    archivePlan,
    getPlanPrices,
    createPlanPrice,
    updatePlanPrice,
    togglePlanPriceSales,
    getCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
} = require("../controllers/platformPlanController");

const { impersonateTenant } = require("../controllers/platformController");

const {
    createPlanSchema,
    updatePlanSchema,
    createTenantSchema,
} = require("../validation/schemas");

// Apply IP Allowlist to all platform endpoints
router.use(platformIpAllowlist);

// ==========================================
// 1. Platform Authentication & MFA (Public / Rate-limited)
// ==========================================
router.post("/auth/login", platformAuthLimiter, login);
router.post("/auth/mfa/setup", platformAuthLimiter, setupMfa);
router.post("/auth/mfa/verify-enrollment", platformAuthLimiter, verifyEnrollment);
router.post("/auth/mfa/challenge", platformAuthLimiter, challengeMfa);
router.post("/auth/refresh", platformAuthLimiter, refreshToken);

// ==========================================
// 2. Protected Platform Routes
// ==========================================
router.use(protectPlatform);

router.get("/auth/me", getMe);

// Platform User Management (super_admin only)
router.get("/users", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_MANAGE), getPlatformUsers);
router.post("/users", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_MANAGE), createPlatformUser);
router.patch("/users/:id", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_MANAGE), updatePlatformUser);
router.delete("/users/:id", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_MANAGE), deletePlatformUser);
router.post("/users/:id/reset-mfa", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_REVOKE), resetUserMfa);
router.post("/users/:id/revoke-sessions", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_REVOKE), revokeUserSessions);

// ==========================================
// Features & Plans Management (Phase 3)
// ==========================================
router.get("/features", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getFeatures);
router.post("/features", requirePlatformPermission(PERMISSIONS.FEATURES_MANAGE), createFeature);
router.patch("/features/:id", requirePlatformPermission(PERMISSIONS.FEATURES_MANAGE), updateFeature);

router.get("/plans", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getPlans);
router.post("/plans", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), createPlan);
router.post("/plans/:id/impact-preview", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), getPlanImpactPreview);
router.patch("/plans/:id", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), updatePlan);
router.post("/plans/:id/archive", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), archivePlan);

// Pricing Tiers & Lifetime Seat Caps
router.get("/prices", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getPlanPrices);
router.post("/prices", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), createPlanPrice);
router.patch("/prices/:id", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), updatePlanPrice);
router.post("/prices/:id/toggle-sales", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), togglePlanPriceSales);

// Coupons & Promotions
router.get("/coupons", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), getCoupons);
router.post("/coupons", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), createCoupon);
router.patch("/coupons/:id", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), updateCoupon);
router.delete("/coupons/:id", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), deleteCoupon);

// ==========================================
// Tenants Management & Subscriber Operations (Phase 2)
// ==========================================
router.get("/tenants", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getTenants);
router.post("/tenants", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), onboardTenant);
router.get("/tenants/:id", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getTenantDetail);
router.patch("/tenants/:id/lifecycle", requirePlatformPermission(PERMISSIONS.TENANTS_LIFECYCLE), updateTenantLifecycle);
router.post("/tenants/:id/notes", requirePlatformPermission(PERMISSIONS.TENANTS_NOTES), addTenantNote);
router.delete("/tenants/:id/notes/:noteId", requirePlatformPermission(PERMISSIONS.TENANTS_NOTES), deleteTenantNote);
router.patch("/tenants/:id/tags", requirePlatformPermission(PERMISSIONS.TENANTS_NOTES), updateTenantTags);
router.post("/tenants/bulk", requirePlatformPermission(PERMISSIONS.TENANTS_LIFECYCLE), bulkTenantActions);
router.post("/tenants/:id/impersonate", requirePlatformPermission(PERMISSIONS.SUPPORT_IMPERSONATE_READ), impersonateTenant);

module.exports = router;
