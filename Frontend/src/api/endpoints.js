import api from './axios';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login        = (email, password, gymCode) =>
  api.post('/users/login', { email, password, gymCode });

export const getSalesUsers   = () => api.get('/users/sales');
export const getReceptionists = () => api.get('/users/receptionists');
export const getSalesTeam    = () => api.get('/users/team');
export const getSalesProfile = (id) => api.get(`/users/team/${id}`);
export const updateMyProfile = (data) => api.patch('/users/me', data);
export const resetUserPassword = (id, newPassword) => api.patch(`/users/${id}/reset-password`, { newPassword });
export const getSalesManagerRevenue = (params = {}) =>
  api.get('/users/sales-manager/revenue', { params });
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
export const switchCoach     = (memberId, newCoachId) =>
  api.put(`/members/${memberId}/coach-rep`, { newCoachId });
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
export const createStaffUser = (data) => api.post('/users/staff', data);

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications    = (params) => api.get('/notifications', { params });
export const getUnreadCount      = () => api.get('/notifications/unread-count');
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');

// ── Members ───────────────────────────────────────────────────────────────────
export const getAllMembers     = (params) => api.get('/members', { params });
export const searchAllMembers  = ()       => api.get('/members/all', { params: { limit: 10000 } });
export const getAllNotes       = (params) => api.get('/members/all-notes', { params });
export const bulkImportMembers = (formData) => api.post('/members/bulk-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getMemberProfile  = (id)       => api.get(`/members/${id}`);
export const createMember      = (data)     => api.post('/members', data);
export const assignSales       = (id, salesId) =>
  api.patch(`/members/${id}/assign-sales`, { salesId });
export const bulkTransferSalesReps = (data) =>
  api.post('/members/bulk-transfer-sales', data);
export const bulkTransferCoach = (data) =>
  api.post('/members/bulk-transfer-coach', data);
export const switchSalesRep = (id, newSalesRepId) =>
  api.put(`/members/${id}/sales-rep`, { newSalesRepId });
export const freezeMember      = (id, data) =>
  api.patch(`/members/${id}/freeze`, data);
export const blockMember       = (id, reason) =>
  api.patch(`/members/${id}/block`, { reason });
export const unblockMember     = (id) =>
  api.patch(`/members/${id}/unblock`);
export const checkInMember     = (id)       => api.post(`/members/${id}/checkin`);
export const checkInByBarcode  = (identifier) => api.post('/members/check-in', { identifier });
export const getTodayCheckIns  = ()         => api.get('/members/today-checkins');
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

export const assignPackage       = (id, data) =>
  api.post(`/members/${id}/package`, data);
export const addPTSessions       = (id, data) =>
  api.post(`/members/${id}/pt-sessions`, data);

// ── Package Exceptions ────────────────────────────────────────────────────────
export const getPackageExceptions         = (params) => api.get('/package-exceptions', { params });
export const getMemberPendingException    = (memberId) =>
  api.get(`/package-exceptions/member/${memberId}`);
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
export const refundPTSessions = (id, refund_amount, reason) =>
  api.post(`/members/${id}/refund_pt`, { memberID: id, refund_amount, reason });

// ── Multi-Tenant SaaS ─────────────────────────────────────────────────────────
export const getTenantMe = () => api.get('/tenant/me');
export const updateTenantMe = (data) => api.patch('/tenant/me', data);
export const uploadTenantLogo = (formData) =>
  api.post('/tenant/me/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// ── Multi-Tenant Billing & Lifetime ───────────────────────────────────────────
export const getBillingPrices = () => api.get('/tenant/billing/prices');
export const checkoutLifetimeBilling = (data) => api.post('/tenant/billing/lifetime/checkout', data);
export const confirmLifetimeBilling = (data) => api.post('/tenant/billing/lifetime/confirm', data);
export const upgradeLifetimeBilling = (data) => api.post('/tenant/billing/lifetime/upgrade', data);
