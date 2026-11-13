import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import { LocationProvider } from './context/LocationContext';
import { WalkthroughProvider } from './tutorials/walkthrough-context';
import WalkthroughOverlay from './components/tutorials/WalkthroughOverlay';
import HelpScenariosDialog from './components/tutorials/HelpScenariosDialog';
import FeatureGate from './components/FeatureGate';
import ErrorBoundary from './components/errors/ErrorBoundary';
import GlobalErrorContainer from './components/errors/GlobalErrorContainer';
import { isMarketingHost, shouldHardRedirectToApp } from './marketing/host';
import { MarketingBootScreen, MarketingPageSkeleton } from './marketing/components/MarketingSkeleton';
import { canEnterRoute, homePath } from './lib/routeAccess';
import { TENANT_GUARDS } from './lib/tenantGuards';

const MarketingLayout = lazy(() => import('./marketing/layout/MarketingLayout'));
const MarketingHomePage = lazy(() => import('./marketing/pages/HomePage'));
const MarketingPlansPage = lazy(() => import('./marketing/pages/PlansPage'));
const MarketingGetStartedPage = lazy(() => import('./marketing/pages/GetStartedPage'));
const MarketingWhyFormaPage = lazy(() => import('./marketing/pages/WhyFormaPage'));
const MarketingSolutionPage = lazy(() => import('./marketing/pages/SolutionPage'));
const MarketingTechnologyPage = lazy(() => import('./marketing/pages/TechnologyPage'));
const MarketingFaqPage = lazy(() => import('./marketing/pages/FaqPage'));
const MarketingPolicyPage = lazy(() => import('./marketing/pages/PolicyPage'));
const PublicSiteGate = lazy(() => import('./marketing/PublicSiteGate'));
const RedirectToApp = lazy(() => import('./marketing/RedirectToApp'));

import Login          from './pages/Login';
import SetupPassword  from './pages/SetupPassword';
import ForgotPassword from './pages/ForgotPassword';
import Members        from './pages/Members';
import Tasks          from './pages/Tasks';
import AssigningTasksPage from './pages/tasks/AssigningTasksPage';
import AssignedTasksPage  from './pages/tasks/AssignedTasksPage';
import TaskFilterPage     from './pages/tasks/TaskFilterPage';
import TaskFilterResultsPage from './pages/tasks/TaskFilterResultsPage';
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
import ConnectWhatsApp from './pages/account/ConnectWhatsApp';
import TargetDashboard    from './pages/sales/TargetDashboard';
import SalesSubscriptions from './pages/sales/SalesSubscriptions';
import SalesCallCenter    from './pages/sales/SalesCallCenter';
import PackageRequests    from './pages/accounting/PackageRequests';
import ContractHistory    from './pages/accounting/ContractHistory';
import CoachDashboard     from './pages/coach/CoachDashboard';
import CoachMembers       from './pages/coach/CoachMembers';
import CoachCheckin       from './pages/coach/CoachCheckin';
import CoachStaff         from './pages/coach/CoachStaff';
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
import ImportMembers      from './pages/sales/ImportMembers';
import ReceptionContacts  from './pages/ReceptionContacts';
import Reports         from './pages/Reports';
import Management      from './pages/Management';
import AccessControl   from './pages/management/AccessControl';
import QuickTransfer  from './pages/management/QuickTransfer';
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

const PAGES = {
  ConnectWhatsApp,
  Members,
  Tasks,
  AssigningTasksPage,
  TaskFilterPage,
  TaskFilterResultsPage,
  AssignedTasksPage,
  MemberProfile,
  CheckIn,
  SalesDashboard,
  SalesMembers,
  SalesRequests,
  SalesTeam,
  ReceptionistProfile,
  SalesPersonProfile,
  CallCenter,
  ManageStaff,
  ManagePackages,
  ManageWhatsAppTemplates,
  TargetDashboard,
  SalesSubscriptions,
  SalesCallCenter,
  ImportMembers,
  AccountantDashboard,
  PackageRequests,
  ContractHistory,
  CoachDashboard,
  CoachMembers,
  CoachCheckin,
  AttendanceReport,
  CoachStaff,
  CoachTargets,
  CoachProfile,
  CoachTransfers,
  ReceptionContacts,
  OwnerDashboard,
  OwnerTeams,
  OwnerUserProfile,
  TenantSettings,
  RoleAccess,
  Management,
  AccessControl,
  QuickTransfer,
  AnalyticsHome,
  Reports,
  ExecutiveSummary,
  ChurnReport,
  ForecastReport,
  CohortReport,
  FunnelReport,
  GuestMembers,
  ExpiredMembers,
  ImportedMembers,
};

function PrivateRoute({ children, roles, feature, access }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!canEnterRoute(user, { roles, access })) return <Navigate to="/" replace />;
  if (feature) {
    return <FeatureGate feature={feature}>{children}</FeatureGate>;
  }
  return children;
}

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePath(user)} replace />;
}

// ── Tenant Router ─────────────────────────────────────────────────────────────
function TenantAppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/setup-password" element={<SetupPassword />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      {TENANT_GUARDS.map((guard) => {
        const Page = PAGES[guard.page];
        return (
          <Route
            key={guard.path}
            path={guard.path}
            element={
              <PrivateRoute roles={guard.roles} feature={guard.feature} access={guard.access}>
                <Page />
              </PrivateRoute>
            }
          />
        );
      })}
      <Route path="/sales/transfer" element={<Navigate to="/tasks" replace />} />
      <Route path="/coach/transfer" element={<Navigate to="/tasks" replace />} />
      <Route path="/accounting/exceptions" element={<Navigate to="/accounting/package-requests" replace />} />
      <Route path="/settings" element={<Navigate to="/owner/settings" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function MarketingFallback({ variant }) {
  if (variant) return <MarketingPageSkeleton variant={variant} />;
  return <MarketingBootScreen />;
}

/** Auth pages must work on www and app (local VITE_SITE=www included). */
function AuthShell({ children }) {
  return (
    <AuthProvider>
      <TenantProvider>
        <LocationProvider>{children}</LocationProvider>
      </TenantProvider>
    </AuthProvider>
  );
}

function TenantShell() {
  return (
    <AuthProvider>
      <TenantProvider>
        <LocationProvider>
          <WalkthroughProvider>
            <TenantAppRoutes />
            <WalkthroughOverlay />
            <HelpScenariosDialog />
          </WalkthroughProvider>
        </LocationProvider>
      </TenantProvider>
    </AuthProvider>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    document.getElementById('seo-prerender')?.setAttribute('hidden', '');
  }, []);

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

  const marketing = isMarketingHost();
  // Production www/apex → staff + platform live on app.* (hard redirect). Local VITE_SITE=www keeps same origin.
  const sendStaffToAppHost = shouldHardRedirectToApp();

  const platformElement = sendStaffToAppHost ? (
    <Suspense fallback={<MarketingFallback />}>
      <RedirectToApp />
    </Suspense>
  ) : (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#090D16] text-xs font-mono text-slate-400">
          Loading Platform Console...
        </div>
      }
    >
      <PlatformApp />
    </Suspense>
  );

  const authElement = (page) =>
    sendStaffToAppHost ? (
      <Suspense fallback={<MarketingFallback />}>
        <RedirectToApp />
      </Suspense>
    ) : (
      <AuthShell>{page}</AuthShell>
    );

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalErrorContainer />
        <Routes>
          {/* Platform — on app (or localhost); www prod redirects to app./platform */}
          <Route path="/platform/*" element={platformElement} />
          <Route path="/platform-next/*" element={<Navigate to="/platform" replace />} />

          {/* Gym auth — production www redirects to app.forma-official.com */}
          <Route path="/login" element={authElement(<Login />)} />
          <Route path="/auth/setup-password" element={authElement(<SetupPassword />)} />
          <Route path="/auth/forgot-password" element={authElement(<ForgotPassword />)} />

          {/* Marketing: www only — gated when under development (super admin preview) */}
          {marketing ? (
            <Route
              element={
                <Suspense fallback={<MarketingFallback />}>
                  <PublicSiteGate />
                </Suspense>
              }
            >
              <Route
                element={
                  <Suspense fallback={<MarketingFallback />}>
                    <MarketingLayout />
                  </Suspense>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<MarketingFallback variant="home" />}>
                      <MarketingHomePage />
                    </Suspense>
                  }
                />
                <Route
                  path="plans"
                  element={
                    <Suspense fallback={<MarketingFallback variant="plans" />}>
                      <MarketingPlansPage />
                    </Suspense>
                  }
                />
                <Route
                  path="why-forma"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingWhyFormaPage />
                    </Suspense>
                  }
                />
                <Route
                  path="get-started"
                  element={
                    <Suspense fallback={<MarketingFallback variant="form" />}>
                      <MarketingGetStartedPage />
                    </Suspense>
                  }
                />
                <Route
                  path="gym-management-software-egypt"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingSolutionPage
                        solutionKey="egypt"
                        barePath="/gym-management-software-egypt"
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="whatsapp-gym-crm"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingSolutionPage solutionKey="whatsapp" barePath="/whatsapp-gym-crm" />
                    </Suspense>
                  }
                />
                <Route
                  path="multi-branch-gym-software"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingSolutionPage
                        solutionKey="multiBranch"
                        barePath="/multi-branch-gym-software"
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="technology"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingTechnologyPage />
                    </Suspense>
                  }
                />
                <Route
                  path="faq"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingFaqPage />
                    </Suspense>
                  }
                />
                <Route
                  path="privacy"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingPolicyPage policyKey="privacy" />
                    </Suspense>
                  }
                />
                <Route
                  path="terms"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingPolicyPage policyKey="terms" />
                    </Suspense>
                  }
                />
                <Route
                  path="refunds"
                  element={
                    <Suspense fallback={<MarketingFallback variant="article" />}>
                      <MarketingPolicyPage policyKey="refunds" />
                    </Suspense>
                  }
                />
                <Route path="checkout" element={<Navigate to="/get-started" replace />} />

                {/* Arabic locale mirrors (EN stays at unprefixed paths) */}
                <Route path="ar">
                  <Route
                    index
                    element={
                      <Suspense fallback={<MarketingFallback variant="home" />}>
                        <MarketingHomePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="plans"
                    element={
                      <Suspense fallback={<MarketingFallback variant="plans" />}>
                        <MarketingPlansPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="why-forma"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingWhyFormaPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="get-started"
                    element={
                      <Suspense fallback={<MarketingFallback variant="form" />}>
                        <MarketingGetStartedPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="gym-management-software-egypt"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingSolutionPage
                          solutionKey="egypt"
                          barePath="/gym-management-software-egypt"
                        />
                      </Suspense>
                    }
                  />
                  <Route
                    path="whatsapp-gym-crm"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingSolutionPage
                          solutionKey="whatsapp"
                          barePath="/whatsapp-gym-crm"
                        />
                      </Suspense>
                    }
                  />
                  <Route
                    path="multi-branch-gym-software"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingSolutionPage
                          solutionKey="multiBranch"
                          barePath="/multi-branch-gym-software"
                        />
                      </Suspense>
                    }
                  />
                  <Route
                    path="technology"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingTechnologyPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="faq"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingFaqPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="privacy"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingPolicyPage policyKey="privacy" />
                      </Suspense>
                    }
                  />
                  <Route
                    path="terms"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingPolicyPage policyKey="terms" />
                      </Suspense>
                    }
                  />
                  <Route
                    path="refunds"
                    element={
                      <Suspense fallback={<MarketingFallback variant="article" />}>
                        <MarketingPolicyPage policyKey="refunds" />
                      </Suspense>
                    }
                  />
                  <Route path="checkout" element={<Navigate to="/ar/get-started" replace />} />
                </Route>
              </Route>
            </Route>
          ) : null}

          {/* Staff tenant app on app.* ; www prod → RedirectToApp; local www preview → TenantShell */}
          <Route
            path="/*"
            element={
              sendStaffToAppHost ? (
                <Suspense fallback={<MarketingFallback />}>
                  <RedirectToApp />
                </Suspense>
              ) : (
                <TenantShell />
              )
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