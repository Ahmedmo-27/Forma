const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate");
const { protectPlatform } = require("../middleware/platformAuth");
const { requirePlatformPermission } = require("../middleware/platformRbac");
const { PERMISSIONS } = require("../config/platformPermissions");
const { platformAuthLimiter } = require("../middleware/platformRateLimit");
const { platformIpAllowlist } = require("../middleware/ipAllowlist");
const { cacheResponse } = require("../middleware/apiCache");
const { autoInvalidate } = require("../utils/cacheInvalidator");

const {
    login,
    refreshToken,
    logout,
    getMe,
} = require("../controllers/platformAuthController");

const {
    getPlatformUsers,
    createPlatformUser,
    updatePlatformUser,
    deletePlatformUser,
    revokeUserSessions,
} = require("../controllers/platformUserController");

const {
    getTenants,
    getTenantDetail,
    onboardTenant,
    updateTenantName,
    updateTenantPurpose,
    updateTenantLifecycle,
    addTenantNote,
    deleteTenantNote,
    updateTenantTags,
    bulkTenantActions,
} = require("../controllers/platformTenantController");
const {
    listTenantStaff,
    getTenantStaffAccess,
    createTenantStaff,
    updateTenantStaff,
    updateTenantStaffAccess,
    deleteTenantStaff,
} = require("../controllers/platformStaffAccessController");
const {
    listTenantLocations,
    createTenantLocation,
    updateTenantLocation,
    deleteTenantLocation,
} = require("../controllers/platformLocationController");
const {
    getFeatures,
    getRoles,
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

const {
    getPendingPayments,
    confirmPayment,
    rejectPayment,
    getInvoices,
    downloadInvoice,
    processRefund,
    issueManualGrant,
    getLedgerEvents,
    exportLedgerCsv,
} = require("../controllers/platformBillingController");

const {
    listFeatureTrials,
    approveFeatureTrial,
    rejectFeatureTrial,
    grantFeatureTrial,
} = require("../controllers/platformFeatureTrialController");

const {
    listStaffIdentityRequests,
    approveDual,
    approveTransfer,
    rejectStaffIdentity,
} = require("../controllers/platformStaffIdentityController");

const {
    getOverview,
    getSnapshots,
    getUpsellAndChurnLists,
    getAtRiskQueue,
    getCostInsights,
    triggerSnapshot,
    exportAnalyticsCsv,
} = require("../controllers/platformAnalyticsController");

const {
    createImpersonationSession,
    exportTenantData,
    purgeTenant,
    getAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getPlatformAuditLogs,
} = require("../controllers/platformSupportController");

const {
    getSystemHealth,
    toggleMaintenanceMode,
    togglePublicSite,
    updatePlatformSetting,
} = require("../controllers/platformSystemController");

const {
    getBackendLogs,
    getFrontendLogs,
} = require("../controllers/platformLogsController");

const {
    getCampaignTemplates,
    getCampaignAudience,
    getCampaigns,
    sendCampaign,
} = require("../controllers/platformCampaignController");

const {
    createPlanSchema,
    updatePlanSchema,
    createTenantSchema,
    updateTenantNameSchema,
} = require("../validation/schemas");

// Apply IP Allowlist to all platform endpoints
router.use(platformIpAllowlist);

// ==========================================
// 1. Platform Authentication (Public / Rate-limited)
// ==========================================
router.post("/auth/login", platformAuthLimiter, login);
router.post("/auth/refresh", platformAuthLimiter, refreshToken);
router.post("/auth/logout", logout);

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
router.post("/users/:id/revoke-sessions", requirePlatformPermission(PERMISSIONS.PLATFORM_USERS_REVOKE), revokeUserSessions);

// ==========================================
// Features & Plans Management (Phase 3)
// ==========================================
router.get("/features", requirePlatformPermission(PERMISSIONS.TENANTS_READ), cacheResponse({ ttlSeconds: 600, scope: "platform", tags: ["platform:plans"] }), getFeatures);
router.get("/roles", requirePlatformPermission(PERMISSIONS.TENANTS_READ), cacheResponse({ ttlSeconds: 600, scope: "platform", tags: ["platform:plans"] }), getRoles);
router.post("/features", requirePlatformPermission(PERMISSIONS.FEATURES_MANAGE), autoInvalidate(["plans"], "platform"), createFeature);
router.patch("/features/:id", requirePlatformPermission(PERMISSIONS.FEATURES_MANAGE), autoInvalidate(["plans"], "platform"), updateFeature);

router.get("/plans", requirePlatformPermission(PERMISSIONS.TENANTS_READ), cacheResponse({ ttlSeconds: 600, scope: "platform", tags: ["platform:plans"] }), getPlans);
router.post("/plans", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), autoInvalidate(["plans"], "platform"), createPlan);
router.post("/plans/:id/impact-preview", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), getPlanImpactPreview);
router.patch("/plans/:id", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), autoInvalidate(["plans", "tenants"], "platform"), updatePlan);
router.post("/plans/:id/archive", requirePlatformPermission(PERMISSIONS.PLANS_MANAGE), autoInvalidate(["plans"], "platform"), archivePlan);

// Pricing Tiers & Lifetime Seat Caps
router.get("/prices", requirePlatformPermission(PERMISSIONS.TENANTS_READ), cacheResponse({ ttlSeconds: 600, scope: "platform", tags: ["platform:plans"] }), getPlanPrices);
router.post("/prices", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), autoInvalidate(["plans"], "platform"), createPlanPrice);
router.patch("/prices/:id", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), autoInvalidate(["plans"], "platform"), updatePlanPrice);
router.post("/prices/:id/toggle-sales", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), autoInvalidate(["plans"], "platform"), togglePlanPriceSales);

// Coupons & Promotions
router.get("/coupons", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), cacheResponse({ ttlSeconds: 300, scope: "platform", tags: ["platform:plans"] }), getCoupons);
router.post("/coupons", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), autoInvalidate(["plans"], "platform"), createCoupon);
router.patch("/coupons/:id", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), autoInvalidate(["plans"], "platform"), updateCoupon);
router.delete("/coupons/:id", requirePlatformPermission(PERMISSIONS.PRICING_MANAGE), autoInvalidate(["plans"], "platform"), deleteCoupon);

// ==========================================
// Tenants Management & Subscriber Operations (Phase 2)
// ==========================================
router.get("/tenants", requirePlatformPermission(PERMISSIONS.TENANTS_READ), cacheResponse({ ttlSeconds: 60, scope: "platform", tags: ["platform:tenants"] }), getTenants);
router.post("/tenants", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), autoInvalidate(["tenants", "analytics"], "platform"), onboardTenant);
router.get("/tenants/:id", requirePlatformPermission(PERMISSIONS.TENANTS_READ), cacheResponse({ ttlSeconds: 60, scope: "platform", tags: ["platform:tenants"] }), getTenantDetail);
router.get("/tenants/:id/staff", requirePlatformPermission(PERMISSIONS.TENANTS_READ), listTenantStaff);
router.post("/tenants/:id/staff", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), createTenantStaff);
router.get("/tenants/:id/staff/:userId/access", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getTenantStaffAccess);
router.patch("/tenants/:id/staff/:userId", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), updateTenantStaff);
router.put("/tenants/:id/staff/:userId/access", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), updateTenantStaffAccess);
router.delete("/tenants/:id/staff/:userId", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), deleteTenantStaff);

router.get("/tenants/:id/locations", requirePlatformPermission(PERMISSIONS.TENANTS_READ), listTenantLocations);
router.post("/tenants/:id/locations", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), createTenantLocation);
router.patch("/tenants/:id/locations/:locationId", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), updateTenantLocation);
router.delete("/tenants/:id/locations/:locationId", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), deleteTenantLocation);
router.patch("/tenants/:id/lifecycle", requirePlatformPermission(PERMISSIONS.TENANTS_LIFECYCLE), autoInvalidate(["tenants", "analytics"], "platform"), updateTenantLifecycle);
router.patch("/tenants/:id/name", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), autoInvalidate(["tenants"], "platform"), validate(updateTenantNameSchema), updateTenantName);
router.patch("/tenants/:id/purpose", requirePlatformPermission(PERMISSIONS.TENANTS_WRITE), autoInvalidate(["tenants"], "platform"), updateTenantPurpose);
router.post("/tenants/:id/notes", requirePlatformPermission(PERMISSIONS.TENANTS_NOTES), addTenantNote);
router.delete("/tenants/:id/notes/:noteId", requirePlatformPermission(PERMISSIONS.TENANTS_NOTES), deleteTenantNote);
router.patch("/tenants/:id/tags", requirePlatformPermission(PERMISSIONS.TENANTS_NOTES), updateTenantTags);
router.post("/tenants/bulk", requirePlatformPermission(PERMISSIONS.TENANTS_LIFECYCLE), autoInvalidate(["tenants", "analytics"], "platform"), bulkTenantActions);
router.post("/tenants/:id/impersonate", requirePlatformPermission(PERMISSIONS.SUPPORT_IMPERSONATE_READ), createImpersonationSession);

// ==========================================
// Billing & Payments Operations (Phase 4)
// ==========================================
router.get("/billing/payments", requirePlatformPermission(PERMISSIONS.BILLING_PAYMENTS), getPendingPayments);
router.post("/billing/payments/:id/confirm", requirePlatformPermission(PERMISSIONS.BILLING_PAYMENTS), autoInvalidate(["tenants", "analytics"], "platform"), confirmPayment);
router.post("/billing/payments/:id/reject", requirePlatformPermission(PERMISSIONS.BILLING_PAYMENTS), autoInvalidate(["tenants", "analytics"], "platform"), rejectPayment);

// Feature trial requests inbox
router.get("/feature-trials", requirePlatformPermission(PERMISSIONS.TENANTS_FEATURE_TRIALS), listFeatureTrials);
router.post(
    "/tenants/:id/feature-trials",
    requirePlatformPermission(PERMISSIONS.TENANTS_FEATURE_TRIALS),
    autoInvalidate(["tenants"], "platform"),
    grantFeatureTrial
);
router.post(
    "/feature-trials/:id/approve",
    requirePlatformPermission(PERMISSIONS.TENANTS_FEATURE_TRIALS),
    autoInvalidate(["tenants"], "platform"),
    approveFeatureTrial
);
router.post(
    "/feature-trials/:id/reject",
    requirePlatformPermission(PERMISSIONS.TENANTS_FEATURE_TRIALS),
    autoInvalidate(["tenants"], "platform"),
    rejectFeatureTrial
);

// Cross-tenant staff identity requests inbox
router.get(
    "/staff-identity-requests",
    requirePlatformPermission(PERMISSIONS.TENANTS_STAFF_IDENTITY),
    listStaffIdentityRequests
);
router.post(
    "/staff-identity-requests/:id/dual",
    requirePlatformPermission(PERMISSIONS.TENANTS_STAFF_IDENTITY),
    autoInvalidate(["tenants", "users"], "platform"),
    approveDual
);
router.post(
    "/staff-identity-requests/:id/transfer",
    requirePlatformPermission(PERMISSIONS.TENANTS_STAFF_IDENTITY),
    autoInvalidate(["tenants", "users"], "platform"),
    approveTransfer
);
router.post(
    "/staff-identity-requests/:id/reject",
    requirePlatformPermission(PERMISSIONS.TENANTS_STAFF_IDENTITY),
    autoInvalidate(["tenants", "users"], "platform"),
    rejectStaffIdentity
);

router.get("/billing/invoices", requirePlatformPermission(PERMISSIONS.BILLING_INVOICES), getInvoices);
router.get("/billing/invoices/:id/download", requirePlatformPermission(PERMISSIONS.BILLING_INVOICES), downloadInvoice);

router.post("/billing/refunds", requirePlatformPermission(PERMISSIONS.BILLING_REFUNDS), autoInvalidate(["tenants", "analytics"], "platform"), processRefund);
router.post("/billing/grants", requirePlatformPermission(PERMISSIONS.BILLING_GRANTS), autoInvalidate(["tenants", "analytics"], "platform"), issueManualGrant);

router.get("/billing/ledger", requirePlatformPermission(PERMISSIONS.BILLING_LEDGER), getLedgerEvents);
router.get("/billing/ledger/export", requirePlatformPermission(PERMISSIONS.BILLING_LEDGER), exportLedgerCsv);

// ==========================================
// Business Analytics & Snapshots (Phase 5)
// ==========================================
router.get("/analytics/overview", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), cacheResponse({ ttlSeconds: 180, scope: "platform", tags: ["platform:analytics"] }), getOverview);
router.get("/analytics/snapshots", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), cacheResponse({ ttlSeconds: 300, scope: "platform", tags: ["platform:analytics"] }), getSnapshots);
router.get("/analytics/health-details", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), cacheResponse({ ttlSeconds: 180, scope: "platform", tags: ["platform:analytics"] }), getUpsellAndChurnLists);
router.get("/analytics/at-risk", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), cacheResponse({ ttlSeconds: 180, scope: "platform", tags: ["platform:analytics", "platform:tenants"] }), getAtRiskQueue);
router.get("/analytics/cost-insights", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), cacheResponse({ ttlSeconds: 180, scope: "platform", tags: ["platform:analytics"] }), getCostInsights);
router.post("/analytics/snapshots/compute", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), autoInvalidate(["analytics"], "platform"), triggerSnapshot);
router.get("/analytics/export", requirePlatformPermission(PERMISSIONS.ANALYTICS_VIEW), exportAnalyticsCsv);

// ==========================================
// Support, Impersonation & Data Lifecycle (Phase 6)
// ==========================================
router.post("/support/impersonate", requirePlatformPermission(PERMISSIONS.SUPPORT_IMPERSONATE_READ), createImpersonationSession);
router.get("/support/tenants/:id/export", requirePlatformPermission(PERMISSIONS.SUPPORT_EXPORT_DATA), exportTenantData);
router.delete("/tenants/:id/purge", requirePlatformPermission(PERMISSIONS.TENANTS_PURGE), autoInvalidate(["tenants", "analytics"], "platform"), purgeTenant);

// Announcements
router.get("/announcements", requirePlatformPermission(PERMISSIONS.TENANTS_READ), getAnnouncements);
router.post("/announcements", requirePlatformPermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE), createAnnouncement);
router.patch("/announcements/:id", requirePlatformPermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE), updateAnnouncement);
router.delete("/announcements/:id", requirePlatformPermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE), deleteAnnouncement);

router.get("/campaigns/templates", requirePlatformPermission(PERMISSIONS.CAMPAIGNS_MANAGE), getCampaignTemplates);
router.get("/campaigns/audience", requirePlatformPermission(PERMISSIONS.CAMPAIGNS_MANAGE), getCampaignAudience);
router.get("/campaigns", requirePlatformPermission(PERMISSIONS.CAMPAIGNS_MANAGE), getCampaigns);
router.post("/campaigns", requirePlatformPermission(PERMISSIONS.CAMPAIGNS_MANAGE), sendCampaign);

// Platform Audit Log Viewer
router.get("/audit", requirePlatformPermission(PERMISSIONS.AUDIT_VIEW), getPlatformAuditLogs);

// System Health & Maintenance
router.get("/system/health", requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH), cacheResponse({ ttlSeconds: 30, scope: "platform", tags: ["platform:system"] }), getSystemHealth);
router.get("/system/logs/backend", requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH), getBackendLogs);
router.get("/system/logs/frontend", requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH), getFrontendLogs);
router.post("/system/maintenance", requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH), autoInvalidate(["system"], "platform"), toggleMaintenanceMode);
router.post(
    "/system/public-site",
    requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH),
    autoInvalidate(["system", "public"], "platform"),
    togglePublicSite
);
router.patch("/system/settings/:key", requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH), autoInvalidate(["system"], "platform"), updatePlatformSetting);

module.exports = router;
