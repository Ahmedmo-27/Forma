import platformAxios from "./platformAxios";

// Auth & MFA
export const platformLogin = (data) => platformAxios.post("/auth/login", data);
export const platformMfaSetup = (data) => platformAxios.post("/auth/mfa/setup", data);
export const platformMfaVerify = (data) => platformAxios.post("/auth/mfa/verify-enrollment", data);
export const platformMfaChallenge = (data) => platformAxios.post("/auth/mfa/challenge", data);
export const platformGetMe = () => platformAxios.get("/auth/me");

// Platform Users
export const getPlatformUsers = () => platformAxios.get("/users");
export const createPlatformUser = (data) => platformAxios.post("/users", data);
export const updatePlatformUser = (id, data) => platformAxios.patch(`/users/${id}`, data);
export const deletePlatformUser = (id, data) => platformAxios.delete(`/users/${id}`, { data });
export const resetUserMfa = (id, data) => platformAxios.post(`/users/${id}/reset-mfa`, data);
export const revokeUserSessions = (id) => platformAxios.post(`/users/${id}/revoke-sessions`);

// Tenants
export const getTenants = (params) => platformAxios.get("/tenants", { params });
export const getTenantDetail = (id) => platformAxios.get(`/tenants/${id}`);
export const onboardTenant = (data) => platformAxios.post("/tenants", data);
export const updateTenantLifecycle = (id, data) => platformAxios.patch(`/tenants/${id}/lifecycle`, data);
export const addTenantNote = (id, data) => platformAxios.post(`/tenants/${id}/notes`, data);
export const deleteTenantNote = (id, noteId) => platformAxios.delete(`/tenants/${id}/notes/${noteId}`);
export const updateTenantTags = (id, data) => platformAxios.patch(`/tenants/${id}/tags`, data);
export const bulkTenantActions = (data) => platformAxios.post("/tenants/bulk", data);
export const purgeTenant = (id, data) => platformAxios.delete(`/tenants/${id}/purge`, { data });

// Plans & Features
export const getFeatures = () => platformAxios.get("/features");
export const createFeature = (data) => platformAxios.post("/features", data);
export const updateFeature = (id, data) => platformAxios.patch(`/features/${id}`, data);

export const getPlans = () => platformAxios.get("/plans");
export const createPlan = (data) => platformAxios.post("/plans", data);
export const updatePlan = (id, data) => platformAxios.patch(`/plans/${id}`, data);
export const getPlanImpactPreview = (id, data) => platformAxios.post(`/plans/${id}/impact-preview`, data);
export const archivePlan = (id, data) => platformAxios.post(`/plans/${id}/archive`, data);

// Pricing & Coupons
export const getPrices = () => platformAxios.get("/prices");
export const createPrice = (data) => platformAxios.post("/prices", data);
export const updatePrice = (id, data) => platformAxios.patch(`/prices/${id}`, data);
export const togglePriceSales = (id) => platformAxios.post(`/prices/${id}/toggle-sales`);

export const getCoupons = () => platformAxios.get("/coupons");
export const createCoupon = (data) => platformAxios.post("/coupons", data);
export const updateCoupon = (id, data) => platformAxios.patch(`/coupons/${id}`, data);
export const deleteCoupon = (id) => platformAxios.delete(`/coupons/${id}`);

// Billing Operations
export const getPendingPayments = (params) => platformAxios.get("/billing/payments", { params });
export const confirmPayment = (id, data) => platformAxios.post(`/billing/payments/${id}/confirm`, data);
export const rejectPayment = (id, data) => platformAxios.post(`/billing/payments/${id}/reject`, data);

export const getInvoices = (params) => platformAxios.get("/billing/invoices", { params });
export const processRefund = (data) => platformAxios.post("/billing/refunds", data);
export const issueManualGrant = (data) => platformAxios.post("/billing/grants", data);

export const getLedger = (params) => platformAxios.get("/billing/ledger", { params });
export const exportLedgerCsvUrl = "/api/platform/billing/ledger/export";

// Analytics & Snapshots
export const getAnalyticsOverview = () => platformAxios.get("/analytics/overview");
export const getAnalyticsSnapshots = (params) => platformAxios.get("/analytics/snapshots", { params });
export const getHealthDetails = () => platformAxios.get("/analytics/health-details");
export const getCostInsights = () => platformAxios.get("/analytics/cost-insights");
export const computeSnapshotNow = () => platformAxios.post("/analytics/snapshots/compute");

// Support & Impersonation
export const createImpersonationSession = (data) => platformAxios.post("/support/impersonate", data);
export const exportTenantData = (id) => platformAxios.get(`/support/tenants/${id}/export`);

// Announcements
export const getAnnouncements = () => platformAxios.get("/announcements");
export const createAnnouncement = (data) => platformAxios.post("/announcements", data);
export const updateAnnouncement = (id, data) => platformAxios.patch(`/announcements/${id}`, data);
export const deleteAnnouncement = (id) => platformAxios.delete(`/announcements/${id}`);

// Audit Log & System
export const getPlatformAuditLogs = (params) => platformAxios.get("/audit", { params });
export const getSystemHealth = () => platformAxios.get("/system/health");
export const toggleMaintenanceMode = (data) => platformAxios.post("/system/maintenance", data);
export const updatePlatformSetting = (key, data) => platformAxios.patch(`/system/settings/${key}`, data);
