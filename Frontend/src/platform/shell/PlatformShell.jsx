import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { CommandPalette } from "./CommandPalette";
import { PlatformToaster } from "../ui/Toast";
import { apiGetSystemHealth } from "../lib/api/endpoints";
import { PageMetaProvider } from "./PageMetaContext";
import { usePageMeta } from "../lib/pageMeta";

function looksLikeRecordId(segment) {
  return /^[a-f0-9]{16,}$/i.test(segment) || segment.length > 20;
}

export function PlatformShell() {
  return (
    <PageMetaProvider>
      <PlatformShellFrame />
    </PageMetaProvider>
  );
}

function PlatformShellFrame() {
  const { detailLabel } = usePageMeta();
  const location = useLocation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("platform_sidebar_collapsed") === "true";
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeMobileNav = () => {
      if (desktop.matches) setIsMobileOpen(false);
    };
    desktop.addEventListener("change", closeMobileNav);
    return () => desktop.removeEventListener("change", closeMobileNav);
  }, []);

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
        campaigns: "Campaigns",
        audit: "Audit Trail",
        users: "Operators & Roles",
        health: "System Health",
        logs: "Runtime Logs",
        _design: "Design System",
      };

      crumbs.push({
        label: sectionLabels[section] || section,
        href: parts.length > 2 ? `/platform/${section}` : undefined,
      });

      if (parts.length > 2) {
        const segment = decodeURIComponent(parts[2]);
        crumbs.push({
          label: detailLabel || (looksLikeRecordId(segment) ? "Details" : segment),
          href: undefined,
        });
      }
    }

    return crumbs;
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--platform-canvas)] text-[var(--platform-text-primary)] antialiased overflow-hidden">
      {/* Global Banners */}
      <ImpersonationBanner />
      <MaintenanceBanner
        isEnabled={systemHealth?.maintenance?.enabled}
        message={systemHealth?.maintenance?.message}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
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
            systemHealth={systemHealth}
          />

          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-screen-2xl w-full mx-auto">
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
