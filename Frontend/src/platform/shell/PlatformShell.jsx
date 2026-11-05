import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { CommandPalette } from "./CommandPalette";
import { PlatformToaster } from "../ui/Toast";
import { usePlatformAuth } from "../lib/auth/AuthContext";
import { apiGetSystemHealth } from "../lib/api/endpoints";

export function PlatformShell() {
  const { user } = usePlatformAuth();
  const location = useLocation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("platform_sidebar_collapsed") === "true";
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);

  useEffect(() => {
    let active = true;
    apiGetSystemHealth()
      .then((res) => {
        if (active) setSystemHealth(res.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("platform_sidebar_collapsed", String(next));
      return next;
    });
  };

  // Build breadcrumb items based on current path
  const getBreadcrumbs = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    // ["platform", "tenants", "123"]
    const crumbs = [{ label: "Console", href: "/platform/dashboard" }];

    if (parts.length > 1) {
      const section = parts[1];
      const sectionLabels = {
        dashboard: "Dashboard",
        tenants: "Gyms & Subscribers",
        "plans-features": "Plans & Features",
        "pricing-coupons": "Pricing & Coupons",
        "payments-invoices": "Payments & Invoices",
        ledger: "Billing Ledger",
        usage: "Usage & Telemetry",
        support: "Support & Impersonation",
        announcements: "Announcements",
        audit: "Audit Trail",
        users: "Operators & Roles",
        health: "System Health",
        _design: "Design System",
      };

      crumbs.push({
        label: sectionLabels[section] || section,
        href: parts.length > 2 ? `/platform/${section}` : undefined,
      });

      if (parts.length > 2) {
        crumbs.push({
          label: parts[2],
          href: undefined,
        });
      }
    }

    return crumbs;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--platform-canvas)] text-[var(--platform-text-primary)] antialiased">
      {/* Global Banners */}
      <ImpersonationBanner />
      <MaintenanceBanner
        isEnabled={systemHealth?.maintenance?.enabled}
        message={systemHealth?.maintenance?.message}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <TopBar
            onOpenMobile={() => setIsMobileOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            breadcrumbs={getBreadcrumbs()}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={setIsCommandPaletteOpen}
      />

      {/* Global Toast Provider */}
      <PlatformToaster />
    </div>
  );
}
