import { Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { platformQueryClient } from "../lib/api/queryClient";
import { PlatformThemeProvider } from "../lib/theme/ThemeContext";
import { PlatformAuthProvider, usePlatformAuth } from "../lib/auth/AuthContext";
import { PermissionProvider } from "../lib/auth/PermissionContext";
import { PlatformShell } from "../shell/PlatformShell";
import LoginPage from "../features/auth/LoginPage";
import DashboardPage from "../features/dashboard/DashboardPage";
import TenantsListPage from "../features/tenants/TenantsListPage";
import TenantDetailPage from "../features/tenants/TenantDetailPage";
import PlansFeaturesPage from "../features/plans/PlansFeaturesPage";
import PricingCouponsPage from "../features/pricing/PricingCouponsPage";
import PaymentsInvoicesPage from "../features/billing/PaymentsInvoicesPage";
import LedgerPage from "../features/billing/LedgerPage";
import UsagePage from "../features/usage/UsagePage";
import SupportPage from "../features/support/SupportPage";
import AnnouncementsPage from "../features/announcements/AnnouncementsPage";
import AuditPage from "../features/audit/AuditPage";
import UsersPage from "../features/users/UsersPage";
import HealthSettingsPage from "../features/system/HealthSettingsPage";
import DesignSystemPage from "../features/design-system/DesignSystemPage";

function ProtectedShellRoute() {
  const { token, loading } = usePlatformAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--platform-canvas)] text-xs text-[var(--platform-text-muted)]">
        Verifying platform operator session...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/platform/login" replace />;
  }

  return <PlatformShell />;
}

export default function PlatformConsoleApp() {
  return (
    <QueryClientProvider client={platformQueryClient}>
      <PlatformThemeProvider>
        <PlatformAuthProvider>
          <PermissionProvider>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="login" element={<LoginPage />} />

              {/* Protected Platform Console Routes */}
              <Route element={<ProtectedShellRoute />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="_design" element={<DesignSystemPage />} />

                {/* Stubs that render the living design system until each page is reviewable in Phase 4 */}
                <Route path="tenants" element={<TenantsListPage />} />
                <Route path="tenants/:id" element={<TenantDetailPage />} />
                <Route path="plans-features" element={<PlansFeaturesPage />} />
                <Route path="pricing-coupons" element={<PricingCouponsPage />} />
                <Route path="payments-invoices" element={<PaymentsInvoicesPage />} />
                <Route path="ledger" element={<LedgerPage />} />
                <Route path="usage" element={<UsagePage />} />
                <Route path="support" element={<SupportPage />} />
                <Route path="announcements" element={<AnnouncementsPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="health" element={<HealthSettingsPage />} />

                <Route path="*" element={<Navigate to="dashboard" replace />} />
              </Route>
            </Routes>
          </PermissionProvider>
        </PlatformAuthProvider>
      </PlatformThemeProvider>
    </QueryClientProvider>
  );
}
