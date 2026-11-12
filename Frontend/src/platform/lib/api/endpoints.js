import platformClient from "./client";

// ==========================================
// 1. Authentication & MFA
// ==========================================
export const apiLogin = (data, signal) =>
  platformClient.post("/auth/login", data, { signal });

export const apiMfaSetup = (data, signal) =>
  platformClient.post("/auth/mfa/setup", data, { signal });

export const apiMfaVerify = (data, signal) =>
  platformClient.post("/auth/mfa/verify-enrollment", data, { signal });

export const apiMfaChallenge = (data, signal) =>
  platformClient.post("/auth/mfa/challenge", data, { signal });

export const apiGetMe = (signal) =>
  platformClient.get("/auth/me", { signal });

// ==========================================
// 2. Platform Operators & Users
// ==========================================
export const apiGetPlatformUsers = (params, signal) =>
  platformClient.get("/users", {
    params: params instanceof AbortSignal ? undefined : params,
    signal: params instanceof AbortSignal ? params : signal,
  });

export const apiCreatePlatformUser = (data, signal) =>
  platformClient.post("/users", data, { signal });

export const apiUpdatePlatformUser = (id, data, signal) =>
  platformClient.patch(`/users/${id}`, data, { signal });

export const apiDeletePlatformUser = (id, data, signal) =>
  platformClient.delete(`/users/${id}`, { data, signal });

export const apiResetUserMfa = (id, data, signal) =>
  platformClient.post(`/users/${id}/reset-mfa`, data, { signal });

export const apiRevokeUserSessions = (id, signal) =>
  platformClient.post(`/users/${id}/revoke-sessions`, {}, { signal });

// ==========================================
// 3. Tenants (Subscribers)
// ==========================================
export const apiGetTenants = (params, signal) =>
  platformClient.get("/tenants", { params, signal });

export const apiGetTenantDetail = (id, signal) =>
  platformClient.get(`/tenants/${id}`, { signal });

export const apiListTenantStaff = (id, signal) =>
  platformClient.get(`/tenants/${id}/staff`, { signal });

export const apiGetTenantStaffAccess = (id, userId, signal) =>
  platformClient.get(`/tenants/${id}/staff/${userId}/access`, { signal });

export const apiUpdateTenantStaffAccess = (id, userId, features, signal) =>
  platformClient.put(`/tenants/${id}/staff/${userId}/access`, { features }, { signal });

export const apiOnboardTenant = (data, signal) =>
  platformClient.post("/tenants", data, { signal });

export const apiUpdateTenantLifecycle = (id, data, signal) =>
  platformClient.patch(`/tenants/${id}/lifecycle`, data, { signal });

export const apiAddTenantNote = (id, data, signal) =>
  platformClient.post(`/tenants/${id}/notes`, data, { signal });

export const apiDeleteTenantNote = (id, noteId, signal) =>
  platformClient.delete(`/tenants/${id}/notes/${noteId}`, { signal });

export const apiUpdateTenantTags = (id, data, signal) =>
  platformClient.patch(`/tenants/${id}/tags`, data, { signal });

export const apiBulkTenantActions = (data, signal) =>
  platformClient.post("/tenants/bulk", data, { signal });

export const apiPurgeTenant = (id, data, signal) =>
  platformClient.delete(`/tenants/${id}/purge`, { data, signal });

// ==========================================
// 4. Plans & Feature Catalog
// ==========================================
export const apiGetFeatures = (signal) =>
  platformClient.get("/features", { signal });

export const apiGetRoles = (signal) =>
  platformClient.get("/roles", { signal });

export const apiCreateFeature = (data, signal) =>
  platformClient.post("/features", data, { signal });

export const apiUpdateFeature = (id, data, signal) =>
  platformClient.patch(`/features/${id}`, data, { signal });

export const apiGetPlans = (signal) =>
  platformClient.get("/plans", { signal });

export const apiCreatePlan = (data, signal) =>
  platformClient.post("/plans", data, { signal });

export const apiUpdatePlan = (id, data, signal) =>
  platformClient.patch(`/plans/${id}`, data, { signal });

export const apiGetPlanImpactPreview = (id, data, signal) =>
  platformClient.post(`/plans/${id}/impact-preview`, data, { signal });

export const apiArchivePlan = (id, data, signal) =>
  platformClient.post(`/plans/${id}/archive`, data, { signal });

// ==========================================
// 5. Pricing & Promotions
// ==========================================
export const apiGetPrices = (signal) =>
  platformClient.get("/prices", { signal });
export const apiGetPlanPrices = apiGetPrices;

export const apiCreatePrice = (data, signal) =>
  platformClient.post("/prices", data, { signal });
export const apiCreatePlanPrice = apiCreatePrice;

export const apiUpdatePrice = (id, data, signal) =>
  platformClient.patch(`/prices/${id}`, data, { signal });
export const apiUpdatePlanPrice = apiUpdatePrice;

export const apiTogglePriceSales = (id, signal) =>
  platformClient.post(`/prices/${id}/toggle-sales`, {}, { signal });
export const apiTogglePlanPriceSales = apiTogglePriceSales;

export const apiGetCoupons = (params, signal) =>
  platformClient.get("/coupons", {
    params: params instanceof AbortSignal ? undefined : params,
    signal: params instanceof AbortSignal ? params : signal,
  });

export const apiCreateCoupon = (data, signal) =>
  platformClient.post("/coupons", data, { signal });

export const apiUpdateCoupon = (id, data, signal) =>
  platformClient.patch(`/coupons/${id}`, data, { signal });

export const apiDeleteCoupon = (id, signal) =>
  platformClient.delete(`/coupons/${id}`, { signal });

// ==========================================
// 6. Billing & Payments Operations
// ==========================================
export const apiGetPendingPayments = (params, signal) =>
  platformClient.get("/billing/payments", { params, signal });

export const apiConfirmPayment = (id, data, signal) =>
  platformClient.post(`/billing/payments/${id}/confirm`, data, { signal });

export const apiRejectPayment = (id, data, signal) =>
  platformClient.post(`/billing/payments/${id}/reject`, data, { signal });

export const apiGetInvoices = (params, signal) =>
  platformClient.get("/billing/invoices", { params, signal });

export const apiDownloadInvoice = (id, signal) =>
  platformClient.get(`/billing/invoices/${id}/download`, { signal, responseType: "blob" });

export const apiProcessRefund = (data, signal) =>
  platformClient.post("/billing/refunds", data, { signal });

export const apiIssueManualGrant = (data, signal) =>
  platformClient.post("/billing/grants", data, { signal });

export const apiGetLedger = (params, signal) =>
  platformClient.get("/billing/ledger", { params, signal });
export const apiGetLedgerEvents = apiGetLedger;

export const apiExportLedgerUrl = "/api/platform/billing/ledger/export";

// ==========================================
// 7. Business Analytics & Snapshots
// ==========================================
export const apiGetAnalyticsOverview = (signal) =>
  platformClient.get("/analytics/overview", { signal });

export const apiGetAnalyticsSnapshots = (params, signal) =>
  platformClient.get("/analytics/snapshots", { params, signal });

export const apiGetHealthDetails = (signal) =>
  platformClient.get("/analytics/health-details", { signal });

export const apiGetCostInsights = (signal) =>
  platformClient.get("/analytics/cost-insights", { signal });

export const apiComputeSnapshotNow = (signal) =>
  platformClient.post("/analytics/snapshots/compute", {}, {
    signal: signal instanceof AbortSignal ? signal : undefined,
  });
export const apiTriggerSnapshotCompute = apiComputeSnapshotNow;

export const apiExportAnalyticsCsvUrl = "/api/platform/analytics/export";

// ==========================================
// 8. Support, Impersonation & Export
// ==========================================
export const apiCreateImpersonationSession = (data, signal) =>
  platformClient.post("/support/impersonate", data, { signal });

export const apiExportTenantData = (id, signal) =>
  platformClient.get(`/support/tenants/${id}/export`, { signal });

// ==========================================
// 9. Announcements
// ==========================================
export const apiGetAnnouncements = (params, signal) =>
  platformClient.get("/announcements", {
    params: params instanceof AbortSignal ? undefined : params,
    signal: params instanceof AbortSignal ? params : signal,
  });

export const apiCreateAnnouncement = (data, signal) =>
  platformClient.post("/announcements", data, { signal });

export const apiUpdateAnnouncement = (id, data, signal) =>
  platformClient.patch(`/announcements/${id}`, data, { signal });

export const apiDeleteAnnouncement = (id, signal) =>
  platformClient.delete(`/announcements/${id}`, { signal });

// ==========================================
// 10. Audit Logs & System Health
// ==========================================
export const apiGetAuditLogs = (params, signal) =>
  platformClient.get("/audit", { params, signal });

export const apiGetSystemHealth = (signal) =>
  platformClient.get("/system/health", { signal });

export const apiGetBackendLogs = (params, signal) =>
  platformClient.get("/system/logs/backend", { params, signal, skipGlobalError: true });

export const apiGetFrontendLogs = (params, signal) =>
  platformClient.get("/system/logs/frontend", { params, signal, skipGlobalError: true });

export const apiToggleMaintenanceMode = (data, signal) =>
  platformClient.post("/system/maintenance", data, { signal });

export const apiTogglePublicSite = (data, signal) =>
  platformClient.post("/system/public-site", data, { signal });

export const apiUpdatePlatformSetting = (key, data, signal) =>
  platformClient.patch(`/system/settings/${key}`, data, { signal });
export const apiUpdateSystemSetting = apiUpdatePlatformSetting;
