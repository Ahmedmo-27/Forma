import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import FeatureGate from './components/FeatureGate';
import ErrorBoundary from './components/ErrorBoundary';

import Login          from './pages/Login';
import Members        from './pages/Members';
import MemberProfile  from './pages/member/MemberProfile';
import SalesDashboard     from './pages/sales/SalesDashboard';
import SalesMembers       from './pages/sales/SalesMembers';
import SalesRequests      from './pages/sales/SalesRequests';
import SalesTeam          from './pages/sales/SalesTeam';
import SalesPersonProfile from './pages/sales/SalesPersonProfile';
import ReceptionistProfile from './pages/sales/ReceptionistProfile';
import ManageStaff        from './pages/sales/ManageStaff';
import ManagePackages     from './pages/sales/ManagePackages';
import ManageWhatsAppTemplates from './pages/sales/ManageWhatsAppTemplates';
import TargetDashboard    from './pages/sales/TargetDashboard';
import SalesSubscriptions from './pages/sales/SalesSubscriptions';
import SalesCallCenter    from './pages/sales/SalesCallCenter';
import PackageRequests    from './pages/accounting/PackageRequests';
import ContractHistory    from './pages/accounting/ContractHistory';
import CoachDashboard     from './pages/coach/CoachDashboard';
import CoachMembers       from './pages/coach/CoachMembers';
import CoachCheckin       from './pages/coach/CoachCheckin';
import CoachStaff         from './pages/coach/CoachStaff';
import CoachTransfer      from './pages/coach/CoachTransfer';
import CoachTransfers     from './pages/coach/CoachTransfers';
import CoachTargets       from './pages/coach/CoachTargets';
import CoachProfile       from './pages/coach/CoachProfile';
import AccountantDashboard from './pages/accounting/AccountantDashboard';
import OwnerDashboard     from './pages/owner/OwnerDashboard';
import OwnerTeams         from './pages/owner/OwnerTeams';
import OwnerUserProfile   from './pages/owner/OwnerUserProfile';
import TenantSettings     from './pages/owner/TenantSettings';
import CheckIn            from './pages/CheckIn';
import CallCenter         from './pages/sales/CallCenter';
import Transfer           from './pages/sales/Transfer';
import ImportMembers      from './pages/sales/ImportMembers';
import ReceptionContacts  from './pages/ReceptionContacts';
import Reports         from './pages/Reports';
import Management      from './pages/Management';
import GuestMembers    from './pages/reports/GuestMembers';
import ExpiredMembers  from './pages/reports/ExpiredMembers';
import ImportedMembers from './pages/reports/ImportedMembers';
import NotFound       from './pages/NotFound';

// ── Platform Console Imports (Zero Tenant Context) ───────────────────────────
import { PlatformAuthProvider } from './platform/context/PlatformAuthContext';
import PlatformLayout from './platform/components/PlatformLayout';
import PlatformLogin from './platform/pages/PlatformLogin';
import PlatformDashboard from './platform/pages/PlatformDashboard';
import PlatformTenants from './platform/pages/PlatformTenants';
import PlatformTenantDetail from './platform/pages/PlatformTenantDetail';
import PlatformPlansFeatures from './platform/pages/PlatformPlansFeatures';
import PlatformPricingCoupons from './platform/pages/PlatformPricingCoupons';
import PlatformPaymentsInvoices from './platform/pages/PlatformPaymentsInvoices';
import PlatformLedger from './platform/pages/PlatformLedger';
import PlatformUsage from './platform/pages/PlatformUsage';
import PlatformSupport from './platform/pages/PlatformSupport';
import PlatformAnnouncements from './platform/pages/PlatformAnnouncements';
import PlatformAuditLog from './platform/pages/PlatformAuditLog';
import PlatformUsers from './platform/pages/PlatformUsers';
import PlatformSystemHealth from './platform/pages/PlatformSystemHealth';

// ── Protected route wrapper ───────────────────────────────────────────────────
function PrivateRoute({ children, roles, feature }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (feature) {
    return <FeatureGate feature={feature}>{children}</FeatureGate>;
  }
  return children;
}

// ── Root redirect based on role ───────────────────────────────────────────────
function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'Owner') return <Navigate to="/owner/dashboard" replace />;
  if (['Sales', 'Sales Manager'].includes(user.role)) return <Navigate to="/sales/dashboard" replace />;
  if (['Coach', 'Coach Manager'].includes(user.role)) return <Navigate to="/coach/dashboard" replace />;
  if (user.role === 'Accountant') return <Navigate to="/accounting/dashboard" replace />;
  if (user.role === 'Receptionist') return <Navigate to="/checkin" replace />;
  return <Navigate to="/members" replace />;
}

// ── Tenant Router ─────────────────────────────────────────────────────────────
function TenantAppRoutes() {
  return (
    <Routes>
      <Route path="/"      element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />

      {/* Receptionist / Owner */}
      <Route path="/members" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Accountant', 'Coach Manager', 'Receptionist']}>
          <Members />
        </PrivateRoute>
      } />

      {/* Member profile — roles must match Backend membersRoutes profileRoles */}
      <Route path="/members/:id" element={
        <PrivateRoute roles={['Receptionist', 'Owner', 'Sales', 'Sales Manager', 'Coach', 'Coach Manager', 'Accountant']}>
          <MemberProfile />
        </PrivateRoute>
      } />

      {/* Check-in — API writeAccess is Receptionist/Owner/Sales Manager only */}
      <Route path="/checkin" element={
        <PrivateRoute roles={['Receptionist', 'Owner', 'Sales Manager', 'Sales']}>
          <CheckIn />
        </PrivateRoute>
      } />

      {/* Sales routes */}
      <Route path="/sales/dashboard" element={
        <PrivateRoute roles={['Sales', 'Sales Manager', 'Owner']}>
          <SalesDashboard />
        </PrivateRoute>
      } />
      <Route path="/sales/members" element={
        <PrivateRoute roles={['Sales', 'Sales Manager', 'Owner']}>
          <SalesMembers />
        </PrivateRoute>
      } />
      <Route path="/sales/requests" element={
        <PrivateRoute roles={['Sales', 'Sales Manager', 'Owner']}>
          <SalesRequests />
        </PrivateRoute>
      } />
      <Route path="/sales/team" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant']}>
          <SalesTeam />
        </PrivateRoute>
      } />
      <Route path="/sales/team/receptionist/:id" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']}>
          <ReceptionistProfile />
        </PrivateRoute>
      } />
      <Route path="/sales/team/:id" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant']}>
          <SalesPersonProfile />
        </PrivateRoute>
      } />
      <Route path="/sales/callcenter" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} feature="sales_crm">
          <CallCenter />
        </PrivateRoute>
      } />
      <Route path="/sales/staff" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']}>
          <ManageStaff />
        </PrivateRoute>
      } />
      <Route path="/sales/packages" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} feature="packages">
          <ManagePackages />
        </PrivateRoute>
      } />
      <Route path="/sales/whatsapp-templates" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant', 'Coach Manager']} feature="whatsapp">
          <ManageWhatsAppTemplates />
        </PrivateRoute>
      } />
      <Route path="/coach/whatsapp-templates" element={
        <PrivateRoute roles={['Coach Manager']} feature="whatsapp">
          <ManageWhatsAppTemplates />
        </PrivateRoute>
      } />
      <Route path="/sales/targets" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant']} feature="accounting">
          <TargetDashboard />
        </PrivateRoute>
      } />
      <Route path="/sales/subscriptions" element={
        <PrivateRoute roles={['Sales']}>
          <SalesSubscriptions />
        </PrivateRoute>
      } />
      <Route path="/sales/my-callcenter" element={
        <PrivateRoute roles={['Sales']} feature="sales_crm">
          <SalesCallCenter />
        </PrivateRoute>
      } />
      <Route path="/sales/transfer" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']}>
          <Transfer />
        </PrivateRoute>
      } />
      <Route path="/sales/import" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} feature="excel_import">
          <ImportMembers />
        </PrivateRoute>
      } />

      {/* Accountant routes */}
      <Route path="/accounting/dashboard" element={
        <PrivateRoute roles={['Accountant', 'Owner']} feature="accounting">
          <AccountantDashboard />
        </PrivateRoute>
      } />
      <Route path="/accounting/package-requests" element={
        <PrivateRoute roles={['Accountant', 'Owner']} feature="exception_approvals">
          <PackageRequests />
        </PrivateRoute>
      } />
      <Route path="/accounting/contract-history" element={
        <PrivateRoute roles={['Accountant', 'Owner', 'Sales Manager']} feature="accounting">
          <ContractHistory />
        </PrivateRoute>
      } />
      <Route path="/accounting/exceptions" element={<Navigate to="/accounting/package-requests" replace />} />

      {/* Coach routes */}
      <Route path="/coach/dashboard" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']}>
          <CoachDashboard />
        </PrivateRoute>
      } />
      <Route path="/coach/members" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']}>
          <CoachMembers />
        </PrivateRoute>
      } />
      <Route path="/coach/checkin" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']}>
          <CoachCheckin />
        </PrivateRoute>
      } />
      <Route path="/coach/staff" element={
        <PrivateRoute roles={['Coach Manager']}>
          <CoachStaff />
        </PrivateRoute>
      } />
      <Route path="/coach/targets" element={
        <PrivateRoute roles={['Coach Manager']}>
          <CoachTargets />
        </PrivateRoute>
      } />
      <Route path="/coach/team" element={
        <PrivateRoute roles={['Coach Manager']}>
          <CoachTargets />
        </PrivateRoute>
      } />
      <Route path="/coach/team/:id" element={
        <PrivateRoute roles={['Coach Manager']}>
          <CoachProfile />
        </PrivateRoute>
      } />
      <Route path="/coach/transfer" element={
        <PrivateRoute roles={['Coach Manager']}>
          <CoachTransfer />
        </PrivateRoute>
      } />
      <Route path="/coach/my-transfers" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']}>
          <CoachTransfers />
        </PrivateRoute>
      } />

      {/* Reception contacts — all authenticated */}
      <Route path="/contacts" element={
        <PrivateRoute>
          <ReceptionContacts />
        </PrivateRoute>
      } />

      {/* Owner routes */}
      <Route path="/owner/dashboard" element={
        <PrivateRoute roles={['Owner']}>
          <OwnerDashboard />
        </PrivateRoute>
      } />
      <Route path="/owner/teams" element={
        <PrivateRoute roles={['Owner']}>
          <OwnerTeams />
        </PrivateRoute>
      } />
      <Route path="/owner/teams/:id" element={
        <PrivateRoute roles={['Owner']}>
          <OwnerUserProfile />
        </PrivateRoute>
      } />
      <Route path="/owner/settings" element={
        <PrivateRoute roles={['Owner']}>
          <TenantSettings />
        </PrivateRoute>
      } />

      {/* Management */}
      <Route path="/management" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Coach Manager']}>
          <Management />
        </PrivateRoute>
      } />

      {/* Reports */}
      <Route path="/reports" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Sales']}>
          <Reports />
        </PrivateRoute>
      } />
      <Route path="/reports/guests" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Sales']}>
          <GuestMembers />
        </PrivateRoute>
      } />
      <Route path="/reports/expired" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Sales']}>
          <ExpiredMembers />
        </PrivateRoute>
      } />
      <Route path="/reports/imported" element={
        <PrivateRoute roles={['Owner', 'Sales Manager']}>
          <ImportedMembers />
        </PrivateRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* ── Platform Console Subsystem (Zero Tenant Context) ─────────────── */}
          <Route
            path="/platform/*"
            element={
              <PlatformAuthProvider>
                <Routes>
                  <Route path="login" element={<PlatformLogin />} />
                  <Route element={<PlatformLayout />}>
                    <Route index element={<Navigate to="/platform/dashboard" replace />} />
                    <Route path="dashboard" element={<PlatformDashboard />} />
                    <Route path="tenants" element={<PlatformTenants />} />
                    <Route path="tenants/:id" element={<PlatformTenantDetail />} />
                    <Route path="plans-features" element={<PlatformPlansFeatures />} />
                    <Route path="pricing-coupons" element={<PlatformPricingCoupons />} />
                    <Route path="payments-invoices" element={<PlatformPaymentsInvoices />} />
                    <Route path="ledger" element={<PlatformLedger />} />
                    <Route path="usage" element={<PlatformUsage />} />
                    <Route path="support" element={<PlatformSupport />} />
                    <Route path="announcements" element={<PlatformAnnouncements />} />
                    <Route path="audit" element={<PlatformAuditLog />} />
                    <Route path="users" element={<PlatformUsers />} />
                    <Route path="health" element={<PlatformSystemHealth />} />
                    <Route path="*" element={<Navigate to="/platform/dashboard" replace />} />
                  </Route>
                </Routes>
              </PlatformAuthProvider>
            }
          />

          {/* ── Tenant SaaS Subsystem (With AuthProvider and TenantProvider) ─── */}
          <Route
            path="/*"
            element={
              <AuthProvider>
                <TenantProvider>
                  <TenantAppRoutes />
                </TenantProvider>
              </AuthProvider>
            }
          />
        </Routes>

        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#191919',
              color:      '#f0f0f0',
              border:     '1px solid #2a2a2a',
              fontSize:   '13px',
              borderRadius: '8px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#191919' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#191919' } },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
