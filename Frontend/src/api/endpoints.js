import api from './axios';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (username, password) => {
  const id = String(username || '').trim();
  const body = { username: id, password };
  // The deployed API still requires a valid email. Include it when the
  // person typed an address so sign-in works before and after that deploy.
  if (id.includes('@')) body.email = id;
  return api.post('/users/login', body);
};
export const setupPassword = (token, password) =>
  api.post('/users/setup-password', { token, password }, { skipGlobalError: true });
export const forgotPassword = (email) =>
  api.post('/users/forgot-password', { email }, { skipGlobalError: true });

export const getSalesUsers   = () => api.get('/users/sales');
export const getReceptionists = () => api.get('/users/receptionists');
export const getSalesTeam    = () => api.get('/users/team');
export const getSalesProfile = (id) => api.get(`/users/team/${id}`);
export const updateMyProfile = (data) => api.patch('/users/me', data);
export const checkUsernameAvailable = (username) =>
  api.get('/users/username-available', {
    params: { username },
    skipGlobalError: true,
  });
export const resetUserPassword = (id, newPassword) => api.patch(`/users/${id}/reset-password`, { newPassword });
export const lockStaffUser = (id, reason) =>
  api.patch(`/users/${id}/lock`, reason ? { reason } : {});
export const suspendStaffUser = (id, data) =>
  api.patch(`/users/${id}/suspend`, data);
export const unlockStaffUser = (id) =>
  api.patch(`/users/${id}/unlock`);
export const getSalesManagerRevenue = (params = {}) =>
  api.get('/users/sales-manager/revenue', { params });
export const getChurnAnalytics = (params = {}) => api.get('/analytics/churn', { params });
export const getRevenueForecast = () => api.get('/analytics/forecast');
export const getRetentionCohorts = (params = {}) => api.get('/analytics/cohorts', { params });
export const getAttendanceHeatmap = (params = {}) => api.get('/analytics/attendance', { params });
export const getConversionFunnel = (params = {}) => api.get('/analytics/funnel', { params });
export const getExecutiveSummary = () => api.get('/analytics/executive');
export const getBiDashboard = () => api.get('/bi/dashboard');
export const getBiCohorts = () => api.get('/bi/cohorts');
export const getBiHeatmap = () => api.get('/bi/heatmap');
export const getBiForecast = () => api.get('/bi/forecast');
export const getBiFunnel = (params = {}) => api.get('/bi/funnel', { params });
export const getBiInsights = () => api.get('/bi/insights');
export const dismissBiInsight = (id, reason) => api.post(`/bi/insights/${id}/dismiss`, { reason });
export const getBiObjectives = () => api.get('/bi/objectives');
export const suggestBiObjectives = () => api.post('/bi/objectives/suggest');
export const createBiObjective = (data) => api.post('/bi/objectives', data);
export const updateBiObjective = (id, data) => api.patch(`/bi/objectives/${id}`, data);
export const getSubscriptionsByDate = (params = {}) =>
  api.get('/users/sales-manager/subscriptions', { params });
export const getSalesMySubscriptions = (params = {}) =>
  api.get('/users/my-subscriptions', { params });

// ── Coach ─────────────────────────────────────────────────────────────────────
export const getCoachTeam    = () => api.get('/users/coach-team');
export const getCoachProfile = (id) => api.get(`/users/coach-team/${id}`);
export const updateCoachRepAbilities = (id, abilities) =>
  api.patch(`/users/${id}/coach-abilities`, { abilities });
export const getTodayCoachTransfers = () => api.get('/members/today-coach-transfers');
export const assignCoach     = (memberId, coachId) =>
  api.patch(`/members/${memberId}/assign-coach`, { coachId });
export const switchCoach     = (memberId, newCoachId, payload = {}) =>
  api.put(`/members/${memberId}/coach-rep`, { newCoachId, ...payload });
export const updateSalesRepTarget = (id, monthlyTarget) =>
  api.patch(`/users/${id}/target`, { monthlyTarget });
export const updateSalesRepAbilities = (id, abilities) =>
  api.patch(`/users/${id}/abilities`, { abilities });
export const updatePhonePrivacy = (id, canViewPhones) =>
  api.patch(`/users/${id}/phone-privacy`, { canViewPhones });
export const updateStaffMobile = (id, mobile_number) =>
  api.patch(`/users/${id}/mobile`, { mobile_number });
export const getReceptionistTeam = () => api.get('/users/receptionist-team');
export const getUserById = (id) => api.get(`/users/${id}`);
export const searchAccessUsers = (q) => api.get('/users/access/search', { params: { q } });
export const listAccessUsersByRole = (role) => api.get('/users/access/search', { params: { role } });
export const getUserAccess = (id) => api.get(`/users/${id}/access`);
export const updateUserAccess = (id, features, locationGrants = {}) =>
  api.put(`/users/${id}/access`, { features, ...locationGrants });
export const updateUserAreaAccess = (id, add, remove) => api.patch(`/users/${id}/access`, { add, remove });
export const updateRoleAccess = (role, areas, locationIds) =>
  api.put(`/tenant/access/${encodeURIComponent(role)}`, {
    areas,
    ...(Array.isArray(locationIds) ? { locationIds } : {}),
  });
export const createStaffUser = (data) => api.post('/users/staff', data);

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications    = (params) => api.get('/notifications', { params, skipGlobalError: true });
export const getUnreadCount      = () => api.get('/notifications/unread-count', { skipGlobalError: true });
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');

// ── What's New (platform announcements) ───────────────────────────────────────
export const getAnnouncements = (params = {}) =>
  api.get('/announcements', { params, skipGlobalError: true });
export const dismissAnnouncement = (id) =>
  api.post(`/announcements/${id}/dismiss`);
export const dismissAllAnnouncements = () =>
  api.post('/announcements/dismiss-all');

// ── Members ───────────────────────────────────────────────────────────────────
export const getAllMembers     = (params) => api.get('/members', { params });
/** Debounced typeahead for GlobalSearch — never prefetch the full member book. */
export const searchMembersQuick = (search, { signal } = {}) =>
  api.get('/members/all', {
    params: { search, limit: 8, sortBy: 'createdAt', sortDir: -1 },
    signal,
    skipGlobalError: true,
  });
export const getAllNotes       = (params) => api.get('/members/all-notes', { params });
export const bulkImportMembers = (formData) => api.post('/members/bulk-import', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 120000,
});
export const getMemberImportJob = (jobId) => api.get(`/members/bulk-import/${jobId}`, { skipGlobalError: true });
export const getMemberProfile  = (id)       => api.get(`/members/${id}`);
export const createMember      = (data)     => api.post('/members', data);
export const updateMember      = (id, data) => api.patch(`/members/${id}`, data);
export const assignSales       = (id, salesId) =>
  api.patch(`/members/${id}/assign-sales`, { salesId });
export const bulkTransferSalesReps = (data) =>
  api.post('/members/bulk-transfer-sales', data);
export const bulkTransferCoach = (data) =>
  api.post('/members/bulk-transfer-coach', data);
export const switchSalesRep = (id, newSalesRepId, payload = {}) =>
  api.put(`/members/${id}/sales-rep`, { newSalesRepId, ...payload });
export const freezeMember      = (id, data) =>
  api.patch(`/members/${id}/freeze`, data);
export const blockMember       = (id, reason) =>
  api.patch(`/members/${id}/block`, { reason });
export const suspendMember     = (id, data) =>
  api.patch(`/members/${id}/suspend`, data);
export const unblockMember     = (id) =>
  api.patch(`/members/${id}/unblock`);
export const checkInMember     = (id, data = {}) => api.post(`/members/${id}/checkin`, data);
export const checkInByBarcode  = (identifier, data = {}) => api.post('/members/check-in', { identifier, ...data });
export const getTodayCheckIns  = (params = {}) => api.get('/members/today-checkins', { params });
export const uploadMemberPhoto = (id, formData) =>
  api.patch(`/members/${id}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const deleteMemberPhoto = (id) =>
  api.delete(`/members/${id}/photo`);
export const uploadNationalId = (id, formData) =>
  api.patch(`/members/${id}/national-id`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const addNote           = (id, text) =>
  api.post(`/members/${id}/notes`, { text });
export const addAlert          = (id, text) =>
  api.post(`/members/${id}/alerts`, { text });
export const deactivateAlert   = (id, alertId) =>
  api.patch(`/members/${id}/alerts/${alertId}/deactivate`);
export const addInvitation     = (id, formData) =>
  api.post(`/members/${id}/invitations`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// ── Packages ──────────────────────────────────────────────────────────────────
export const getPackages   = (params) => api.get('/packages', { params });
export const createPackage = (data)     => api.post('/packages', data);
export const updatePackage = (id, data) => api.patch(`/packages/${id}`, data);
export const deletePackage = (id)       => api.delete(`/packages/${id}`);

// ── WhatsApp Templates ────────────────────────────────────────────────────────
export const getWhatsAppTemplates    = (params) => api.get('/whatsapp-templates', { params });
export const createWhatsAppTemplate  = (data) => api.post('/whatsapp-templates', data);
export const updateWhatsAppTemplate  = (id, data) => api.patch(`/whatsapp-templates/${id}`, data);
export const deleteWhatsAppTemplate  = (id) => api.delete(`/whatsapp-templates/${id}`);
export const logWhatsAppTemplateSend = (data) => api.post('/whatsapp-templates/log-send', data);
export const getWhatsAppSession = (config) => api.get('/whatsapp/session', config);
export const startWhatsAppSession = () => api.post('/whatsapp/session/start');
export const logoutWhatsAppSession = () => api.post('/whatsapp/session/logout');

// ── Unified inbox ─────────────────────────────────────────────────────────────
export const getInboxConversations = (params) => api.get('/inbox/conversations', { params });
export const getInboxMessages = (id, params) => api.get(`/inbox/conversations/${id}/messages`, { params });
export const sendInboxReply = (id, text) => api.post(`/inbox/conversations/${id}/messages`, { text }, { timeout: 70000 });
export const updateInboxConversation = (id, data) => api.patch(`/inbox/conversations/${id}`, data);
export const getInboxChannels = () => api.get('/inbox/channels');
export const disconnectInboxChannel = (id) => api.delete(`/inbox/channels/${id}`);
export const sendWhatsAppMessage = (data) => api.post('/whatsapp/messages', data, { timeout: 70000 });
export const sendWhatsAppImage = (formData) => api.post('/whatsapp/messages/image', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 90000,
});

export const assignPackage       = (id, data) =>
  api.post(`/members/${id}/package`, data);
export const addPTSessions       = (id, data) =>
  api.post(`/members/${id}/pt-sessions`, data);

// ── Package Exceptions ────────────────────────────────────────────────────────
export const getPackageExceptions         = (params) => api.get('/package-exceptions', { params });
export const getMemberPendingException    = (memberId) =>
  api.get(`/package-exceptions/member/${memberId}`, { skipGlobalError: true });
export const createPackageException       = (data) => api.post('/package-exceptions', data);
export const updatePackageExceptionStatus = (id, status, reviewNote) =>
  api.put(`/package-exceptions/${id}/status`, { status, reviewNote });

// ── Accounting / Contracts ────────────────────────────────────────────────────
export const getContracts = (params) => api.get('/accounting/contracts', { params });

// ── Sales Requests ────────────────────────────────────────────────────────────
export const getRequests         = (params) => api.get('/requests', { params });
export const createRequest       = (memberId)   =>
  api.post('/requests', { memberId: String(memberId) });
export const updateRequestStatus = (id, status) =>
  api.put(`/requests/${id}/status`, { status });

// ── Owner ─────────────────────────────────────────────────────────────────────
export const changeUserRole = (id, new_role) =>
  api.get(`/users/changerole/${id}/${encodeURIComponent(new_role)}`);
export const getAllUsers = () => api.get('/users/receptionists');
export const refundMember = (id, refund_amount, reason) =>
  api.post(`/members/${id}/refund`, { memberID: id, refund_amount, reason });
export const cancelMemberPackage = (id, reason) =>
  api.post(`/members/${id}/cancel-package`, { memberID: id, reason });
export const transferMemberPackage = (id, payload) =>
  api.post(`/members/${id}/transfer-package`, payload);
export const updatePackageTransferFee = (packageTransferFee) =>
  api.patch('/tenant/package-transfer-fee', { packageTransferFee });
export const refundPTSessions = (id, refund_amount, reason) =>
  api.post(`/members/${id}/refund_pt`, { memberID: id, refund_amount, reason });

// ── Multi-Tenant SaaS ─────────────────────────────────────────────────────────
export const getTenantMe = () => api.get('/tenant/me', {
  params: { _: Date.now() },
  // Boot/branding fetch — never open System Error beside a successful login toast.
  skipGlobalError: true,
});
export const updateTenantMe = (data) => api.patch('/tenant/me', data);
export const getTenantOnboarding = () => api.get('/tenant/onboarding');

// ── Contract signatures ───────────────────────────────────────────────────────
export const getContractSignature = (memberId, subscriptionId) =>
  api.get(`/members/${memberId}/subscriptions/${subscriptionId}/signature`);
export const signMemberContract = (memberId, subscriptionId, data) =>
  api.post(`/members/${memberId}/subscriptions/${subscriptionId}/signature`, data);
export const uploadTenantLogo = (formData) =>
  api.post('/tenant/me/logo', formData);

// ── Locations / branches ──────────────────────────────────────────────────────
export const listLocations = () => api.get('/locations', { skipGlobalError: true });
export const createLocation = (data) => api.post('/locations', data);
export const updateLocation = (id, data) => api.patch(`/locations/${id}`, data);
export const deleteLocation = (id) => api.delete(`/locations/${id}`);

// ── Facility maintenance ──────────────────────────────────────────────────────
export const getMaintenanceBoard = (params = {}) => api.get('/maintenance/board', { params });
export const getMaintenanceItems = (params = {}) => api.get('/maintenance/items', { params });
export const createMaintenanceItems = (data) => api.post('/maintenance/items', data);
export const updateMaintenanceItem = (id, data) => api.patch(`/maintenance/items/${id}`, data);
export const deleteMaintenanceItem = (id) => api.delete(`/maintenance/items/${id}`);
export const copyMaintenanceItem = (id, data) => api.post(`/maintenance/items/${id}/copy`, data);
export const completeMaintenanceItem = (id, data = {}) => api.post(`/maintenance/items/${id}/complete`, data);
export const getMaintenanceHistory = (id, params = {}) =>
  api.get(`/maintenance/items/${id}/history`, { params });

// ── Multi-Tenant Billing ──────────────────────────────────────────────────────
export const getBillingPrices = () => api.get('/tenant/billing/prices');

// ── Feature trial requests ────────────────────────────────────────────────────
export const getMyFeatureTrials = () => api.get('/feature-trials/mine');
export const createFeatureTrialRequest = (data) => api.post('/feature-trials', data);
export const cancelFeatureTrialRequest = (id) => api.post(`/feature-trials/${id}/cancel`);

// ── Tasks: Two Player Types (Assigning & Assigned) ──────────────────────────
// Player Type 1: Assigning (Sales Manager, Head Coach, Owner, General Manager)
export const getAssigningCreatedTasks = (params) => api.get('/tasks/assigning/created', { params });
export const getAssigningOverview     = (params) => api.get('/tasks/assigning/overview', { params });
export const getCreatedTasks          = (params) => api.get('/tasks/assigning/created', { params });

// Player Type 2: Assigned (Regular Sales, Coach)
export const getAssignedActiveTasks   = (params) => api.get('/tasks/assigned/active', { params });
export const getAssignedTasks         = (params) => api.get('/tasks/assigned/active', { params });
export const getAssignedTaskHistory   = (params) => api.get('/tasks/assigned/history', { params });
export const completeMemberTask       = (taskId, memberId, data) =>
  api.patch(`/tasks/assigned/${taskId}/members/${memberId}/complete`, data);

// -- Retail, inventory and bar POS ---------------------------------------------
export const getRetailCatalog = (params = {}) => api.get('/retail/catalog', { params });
export const getRetailVendors = (params = {}) => api.get('/retail/vendors', { params });
export const createRetailVendor = (data) => api.post('/retail/vendors', data);
export const updateRetailVendor = (id, data) => api.patch(`/retail/vendors/${id}`, data);
export const deleteRetailVendor = (id) => api.delete(`/retail/vendors/${id}`);
export const getRetailCategories = (params = {}) => api.get('/retail/categories', { params });
export const createRetailCategory = (data) => api.post('/retail/categories', data);
export const updateRetailCategory = (id, data) => api.patch(`/retail/categories/${id}`, data);
export const getRetailProducts = (params = {}) => api.get('/retail/products', { params });
export const createRetailProduct = (data) => api.post('/retail/products', data);
export const updateRetailProduct = (id, data) => api.patch(`/retail/products/${id}`, data);
export const deleteRetailProduct = (id) => api.delete(`/retail/products/${id}`);
export const changeRetailStock = (id, data) => api.post(`/retail/products/${id}/stock`, data);
export const getRetailStockMovements = (id) => api.get(`/retail/products/${id}/movements`);
export const createRetailSale = (data) => api.post('/retail/sales', data);
export const getRetailSales = (params = {}) => api.get('/retail/sales', { params });
export const refundRetailSale = (id, data = {}) => api.post(`/retail/sales/${id}/refund`, data);
export const getRetailSummary = (params = {}) => api.get('/retail/reports/summary', { params });
export const getRetailPayouts = (params = {}) => api.get('/retail/payouts', { params });
export const createRetailPayout = (data) => api.post('/retail/payouts', data);
export const settleRetailPayout = (id) => api.post(`/retail/payouts/${id}/settle`);
export const deleteRetailPayout = (id) => api.delete(`/retail/payouts/${id}`);
