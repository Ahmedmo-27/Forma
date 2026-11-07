import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import FeatureGate from './components/FeatureGate';
import ErrorBoundary from './components/errors/ErrorBoundary';
import GlobalErrorContainer from './components/errors/GlobalErrorContainer';

import Login          from './pages/Login';
import SetupPassword  from './pages/SetupPassword';
import ForgotPassword from './pages/ForgotPassword';
import Members        from './pages/Members';
import Tasks          from './pages/Tasks';
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
import RoleAccess         from './pages/owner/RoleAccess';
import CheckIn            from './pages/CheckIn';
import CallCenter         from './pages/sales/CallCenter';
import Transfer           from './pages/sales/Transfer';
import ImportMembers      from './pages/sales/ImportMembers';
import ReceptionContacts  from './pages/ReceptionContacts';
import Reports         from './pages/Reports';
import Management      from './pages/Management';
import AccessControl   from './pages/management/AccessControl';
import GuestMembers    from './pages/reports/GuestMembers';
import ExpiredMembers  from './pages/reports/ExpiredMembers';
import ImportedMembers from './pages/reports/ImportedMembers';
import ExecutiveSummary from './pages/reports/ExecutiveSummary';
import AnalyticsHome from './pages/bi/AnalyticsHome';
import ChurnReport     from './pages/reports/ChurnReport';
import ForecastReport  from './pages/reports/ForecastReport';
import CohortReport    from './pages/reports/CohortReport';
import AttendanceReport from './pages/reports/AttendanceReport';
import FunnelReport    from './pages/reports/FunnelReport';
import NotFound       from './pages/NotFound';

// ── Platform Console Subsystem (Rebuilt from Scratch, Zero Tenant Context) ────
const PlatformApp = lazy(() => import('./platform/routes/PlatformRoutes'));

// ── Protected route wrapper ───────────────────────────────────────────────────
function accessList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function PrivateRoute({ children, roles, feature, access }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const needed = accessList(access);
  const known = Array.isArray(user.access);
  if (needed.length && known) {
    const allowed = needed.some((key) => user.access.includes(key));
    if (!allowed) return <Navigate to="/" replace />;
    const grants = Array.isArray(user.grants) ? user.grants : [];
    const areaGrants = Array.isArray(user.areaGrants) ? user.areaGrants : [];
    const granted = needed.some((key) => grants.includes(key) || areaGrants.includes(key));
    const managerWithAccess = user.role === 'General Manager' && allowed;
    if (roles && !roles.includes(user.role) && !granted && !managerWithAccess) return <Navigate to="/" replace />;
  } else if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (feature) {
    return <FeatureGate feature={feature}>{children}</FeatureGate>;
  }
  return children;
}

const ANALYTICS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant'];

const ROLE_HOME = {
  Owner: { key: 'owner_dashboard', to: '/owner/dashboard' },
  'General Manager': { key: 'owner_dashboard', to: '/owner/dashboard' },
  Sales: { key: 'sales_dashboard', to: '/sales/dashboard' },
  'Sales Manager': { key: 'sales_dashboard', to: '/sales/dashboard' },
  Coach: { key: 'coach_dashboard', to: '/coach/dashboard' },
  'Coach Manager': { key: 'coach_dashboard', to: '/coach/dashboard' },
  Accountant: { key: 'accounting_dashboard', to: '/accounting/dashboard' },
  Receptionist: { key: 'check_in', to: '/checkin' },
};

const ACCESS_FALLBACKS = [
  { key: 'owner_dashboard', to: '/owner/dashboard' },
  { key: 'sales_dashboard', to: '/sales/dashboard' },
  { key: 'coach_dashboard', to: '/coach/dashboard' },
  { key: 'accounting_dashboard', to: '/accounting/dashboard' },
  { key: 'check_in', to: '/checkin' },
  { key: 'members', to: '/members' },
  { key: 'sales_members', to: '/sales/members' },
  { key: 'coach_members', to: '/coach/members' },
  { key: 'management', to: '/management' },
  { key: 'reports', to: '/reports' },
];

// ── Root redirect based on role ───────────────────────────────────────────────
function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const home = ROLE_HOME[user.role] || { key: 'members', to: '/members' };
  const keys = Array.isArray(user.access) ? user.access : null;
  if (!keys || keys.includes(home.key)) return <Navigate to={home.to} replace />;
  const extra = (user.navExtras || []).find((item) => item?.to);
  if (extra) return <Navigate to={extra.to} replace />;
  const next = ACCESS_FALLBACKS.find((item) => keys.includes(item.key));
  return <Navigate to={next?.to || '/contacts'} replace />;
}

// ── Tenant Router ─────────────────────────────────────────────────────────────
function TenantAppRoutes() {
  return (
    <Routes>
      <Route path="/"      element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/setup-password" element={<SetupPassword />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />

      {/* Receptionist / Owner */}
      <Route path="/members" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Accountant', 'Coach Manager', 'Receptionist']} access="members">
          <Members />
        </PrivateRoute>
      } />
      <Route path="/tasks" element={
        <PrivateRoute roles={['Owner', 'General Manager', 'Sales Manager', 'Accountant', 'Coach Manager']} access="members">
          <Tasks />
        </PrivateRoute>
      } />

      {/* Member profile — roles must match Backend membersRoutes profileRoles */}
      <Route path="/members/:id" element={
        <PrivateRoute roles={['Receptionist', 'Owner', 'Sales', 'Sales Manager', 'Coach', 'Coach Manager', 'Accountant', 'General Manager']} access="member_profile">
          <MemberProfile />
        </PrivateRoute>
      } />

      {/* Check-in — API writeAccess is Receptionist/Owner/Sales Manager only */}
      <Route path="/checkin" element={
        <PrivateRoute roles={['Receptionist', 'Owner', 'Sales Manager', 'Sales']} access="check_in">
          <CheckIn />
        </PrivateRoute>
      } />

      {/* Sales routes */}
      <Route path="/sales/dashboard" element={
        <PrivateRoute roles={['Sales', 'Sales Manager', 'Owner']} access="sales_dashboard">
          <SalesDashboard />
        </PrivateRoute>
      } />
      <Route path="/sales/members" element={
        <PrivateRoute roles={['Sales', 'Sales Manager', 'Owner']} access="sales_members">
          <SalesMembers />
        </PrivateRoute>
      } />
      <Route path="/sales/requests" element={
        <PrivateRoute roles={['Sales', 'Sales Manager', 'Owner']} access={['approve_requests', 'request_assignment', 'request_takeover']}>
          <SalesRequests />
        </PrivateRoute>
      } />
      <Route path="/sales/team" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant']} access="sales_team">
          <SalesTeam />
        </PrivateRoute>
      } />
      <Route path="/sales/team/receptionist/:id" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} access="sales_team">
          <ReceptionistProfile />
        </PrivateRoute>
      } />
      <Route path="/sales/team/:id" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant']} access="sales_team">
          <SalesPersonProfile />
        </PrivateRoute>
      } />
      <Route path="/sales/callcenter" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} feature="sales_crm" access="manager_call_center">
          <CallCenter />
        </PrivateRoute>
      } />
      <Route path="/sales/staff" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} access="staff">
          <ManageStaff />
        </PrivateRoute>
      } />
      <Route path="/sales/packages" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} feature="packages" access="packages">
          <ManagePackages />
        </PrivateRoute>
      } />
      <Route path="/sales/whatsapp-templates" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant', 'Coach Manager']} feature="whatsapp" access="whatsapp_templates">
          <ManageWhatsAppTemplates />
        </PrivateRoute>
      } />
      <Route path="/coach/whatsapp-templates" element={
        <PrivateRoute roles={['Coach Manager']} feature="whatsapp" access="whatsapp_templates">
          <ManageWhatsAppTemplates />
        </PrivateRoute>
      } />
      <Route path="/sales/targets" element={
        <PrivateRoute roles={['Sales Manager', 'Owner', 'Accountant']} feature="accounting" access="targets">
          <TargetDashboard />
        </PrivateRoute>
      } />
      <Route path="/sales/subscriptions" element={
        <PrivateRoute roles={['Sales']} access="sales_dashboard">
          <SalesSubscriptions />
        </PrivateRoute>
      } />
      <Route path="/sales/my-callcenter" element={
        <PrivateRoute roles={['Sales']} feature="sales_crm" access="my_call_center">
          <SalesCallCenter />
        </PrivateRoute>
      } />
      <Route path="/sales/transfer" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} access="transfer">
          <Transfer />
        </PrivateRoute>
      } />
      <Route path="/sales/import" element={
        <PrivateRoute roles={['Sales Manager', 'Owner']} feature="excel_import" access="import_members">
          <ImportMembers />
        </PrivateRoute>
      } />

      {/* Accountant routes */}
      <Route path="/accounting/dashboard" element={
        <PrivateRoute roles={['Accountant', 'Owner']} feature="accounting" access="accounting_dashboard">
          <AccountantDashboard />
        </PrivateRoute>
      } />
      <Route path="/accounting/package-requests" element={
        <PrivateRoute roles={['Accountant', 'Owner']} feature="exception_approvals" access="package_approvals">
          <PackageRequests />
        </PrivateRoute>
      } />
      <Route path="/accounting/contract-history" element={
        <PrivateRoute roles={['Accountant', 'Owner', 'Sales Manager']} feature="accounting" access="contracts">
          <ContractHistory />
        </PrivateRoute>
      } />
      <Route path="/accounting/exceptions" element={<Navigate to="/accounting/package-requests" replace />} />

      {/* Coach routes */}
      <Route path="/coach/dashboard" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']} access="coach_dashboard">
          <CoachDashboard />
        </PrivateRoute>
      } />
      <Route path="/coach/members" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']} access="coach_members">
          <CoachMembers />
        </PrivateRoute>
      } />
      <Route path="/coach/checkin" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']} access="coach_checkin">
          <CoachCheckin />
        </PrivateRoute>
      } />
      <Route path="/coach/staff" element={
        <PrivateRoute roles={['Coach Manager']} access="coach_staff">
          <CoachStaff />
        </PrivateRoute>
      } />
      <Route path="/coach/targets" element={
        <PrivateRoute roles={['Coach Manager']} access="coach_targets">
          <CoachTargets />
        </PrivateRoute>
      } />
      <Route path="/coach/team" element={
        <PrivateRoute roles={['Coach Manager']} access="coach_team">
          <CoachTargets />
        </PrivateRoute>
      } />
      <Route path="/coach/team/:id" element={
        <PrivateRoute roles={['Coach Manager']} access="coach_team">
          <CoachProfile />
        </PrivateRoute>
      } />
      <Route path="/coach/transfer" element={
        <PrivateRoute roles={['Coach Manager']} access="coach_transfer">
          <CoachTransfer />
        </PrivateRoute>
      } />
      <Route path="/coach/my-transfers" element={
        <PrivateRoute roles={['Coach', 'Coach Manager']} access="my_transfers">
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
        <PrivateRoute roles={['Owner', 'General Manager']} access="owner_dashboard">
          <OwnerDashboard />
        </PrivateRoute>
      } />
      <Route path="/owner/teams" element={
        <PrivateRoute roles={['Owner', 'General Manager']} access="teams_overview">
          <OwnerTeams />
        </PrivateRoute>
      } />
      <Route path="/owner/teams/:id" element={
        <PrivateRoute roles={['Owner', 'General Manager']} access="teams_overview">
          <OwnerUserProfile />
        </PrivateRoute>
      } />
      <Route path="/owner/settings" element={
        <PrivateRoute roles={['Owner']} access="settings">
          <TenantSettings />
        </PrivateRoute>
      } />
      <Route path="/owner/access" element={
        <PrivateRoute roles={['Owner', 'General Manager']} access="access_control">
          <RoleAccess />
        </PrivateRoute>
      } />

      {/* Management */}
      <Route path="/management" element={
        <PrivateRoute roles={['Owner', 'General Manager', 'Sales Manager', 'Coach Manager']} access="management">
          <Management />
        </PrivateRoute>
      } />
      <Route path="/management/access" element={
        <PrivateRoute roles={['Owner', 'General Manager', 'Sales Manager', 'Coach Manager']} access="access_control">
          <AccessControl />
        </PrivateRoute>
      } />

      <Route path="/analytics" element={
        <PrivateRoute
          roles={['Owner', 'General Manager', 'Sales Manager', 'Sales', 'Accountant', 'Receptionist', 'Coach', 'Coach Manager']}
          feature="members"
        >
          <AnalyticsHome />
        </PrivateRoute>
      } />
      {/* Reports */}
      <Route path="/reports" element={
        <PrivateRoute
          roles={['Owner', 'General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Accountant']}
          access={['reports', 'accounting_dashboard']}
        >
          <Reports />
        </PrivateRoute>
      } />
      <Route path="/reports/executive" element={
        <PrivateRoute roles={ANALYTICS_ROLES} feature="business_intelligence">
          <ExecutiveSummary />
        </PrivateRoute>
      } />
      <Route path="/reports/churn" element={
        <PrivateRoute roles={ANALYTICS_ROLES} feature="exec_analytics">
          <ChurnReport />
        </PrivateRoute>
      } />
      <Route path="/reports/forecast" element={
        <PrivateRoute roles={ANALYTICS_ROLES} feature="exec_analytics">
          <ForecastReport />
        </PrivateRoute>
      } />
      <Route path="/reports/cohorts" element={
        <PrivateRoute roles={ANALYTICS_ROLES} feature="exec_analytics">
          <CohortReport />
        </PrivateRoute>
      } />
      <Route path="/reports/attendance" element={
        <PrivateRoute roles={ANALYTICS_ROLES} feature="exec_analytics">
          <AttendanceReport />
        </PrivateRoute>
      } />
      <Route path="/reports/funnel" element={
        <PrivateRoute roles={ANALYTICS_ROLES} feature="funnels">
          <FunnelReport />
        </PrivateRoute>
      } />
      <Route path="/reports/guests" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Sales', 'Coach Manager']} access="reports">
          <GuestMembers />
        </PrivateRoute>
      } />
      <Route path="/reports/expired" element={
        <PrivateRoute roles={['Owner', 'Sales Manager', 'Sales', 'Coach Manager']} access="reports">
          <ExpiredMembers />
        </PrivateRoute>
      } />
      <Route path="/reports/imported" element={
        <PrivateRoute roles={['Owner', 'Sales Manager']} access="reports">
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
  useEffect(() => {
    const handleGlobalError = (event) => {
      console.error('[GlobalError]', event.error || event.message);
    };
    const handleUnhandledRejection = (event) => {
      console.error('[UnhandledRejection]', event.reason);
    };
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalErrorContainer />
        <Routes>
          {/* ── Platform Console Subsystem (Rebuilt from Scratch, Zero Tenant Context) ──── */}
          <Route
            path="/platform/*"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-[#090D16] text-xs font-mono text-slate-400">
                    Loading Platform Console...
                  </div>
                }
              >
                <PlatformApp />
              </Suspense>
            }
          />

          {/* ── Backward-compatible redirect from /platform-next/* to /platform/* ──── */}
          <Route path="/platform-next/*" element={<Navigate to="/platform" replace />} />

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