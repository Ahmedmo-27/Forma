import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Package,
  Tags,
  CreditCard,
  BookOpen,
  Activity,
  Headphones,
  Megaphone,
  ShieldCheck,
  Users,
  HeartPulse,
  ScrollText,
  LogOut,
  Palette,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { usePlatformAuth } from "../lib/auth/AuthContext";
import { usePermission } from "../lib/auth/PermissionContext";
import { usePlatformTheme } from "../lib/theme/ThemeContext";
import { Avatar } from "../ui/Avatar";
import { cn } from "../lib/utils/cn";

function formatRole(role) {
  if (!role) return "Operator";
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function Sidebar({ isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) {
  const { user, logout } = usePlatformAuth();
  const { theme, setTheme, resolvedTheme } = usePlatformTheme();

  // Permission hooks
  const canReadTenants = usePermission("tenants.read");
  const canManagePlans = usePermission("plans.manage");
  const canManagePricing = usePermission("pricing.manage");
  const canManagePayments = usePermission("billing.payments");
  const canViewLedger = usePermission("billing.ledger");
  const canSupport = usePermission("support.impersonate_read");
  const canAnnounce = usePermission("announcements.manage");
  const canAudit = usePermission("audit.view");
  const canManageUsers = usePermission("platform_users.manage");
  const canHealth = usePermission("system.health");

  const groups = [
    {
      title: "Overview",
      items: [
        { label: "Dashboard", path: "/platform/dashboard", icon: LayoutDashboard, permitted: canReadTenants },
      ],
    },
    {
      title: "Customers",
      items: [
        { label: "Gyms & Tenants", path: "/platform/tenants", icon: Building2, permitted: canReadTenants },
        { label: "Plans & Features", path: "/platform/plans-features", icon: Package, permitted: canManagePlans },
        { label: "Pricing & Coupons", path: "/platform/pricing-coupons", icon: Tags, permitted: canManagePricing },
      ],
    },
    {
      title: "Revenue & Billing",
      items: [
        { label: "Payments Inbox", path: "/platform/payments-invoices", icon: CreditCard, permitted: canManagePayments },
        { label: "Billing Ledger", path: "/platform/ledger", icon: BookOpen, permitted: canViewLedger },
        { label: "Usage & Telemetry", path: "/platform/usage", icon: Activity, permitted: canReadTenants },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Support & Impersonation", path: "/platform/support", icon: Headphones, permitted: canSupport },
        { label: "Announcements", path: "/platform/announcements", icon: Megaphone, permitted: canAnnounce },
        { label: "Security Audit Log", path: "/platform/audit", icon: ShieldCheck, permitted: canAudit },
      ],
    },
    {
      title: "Platform",
      items: [
        { label: "Operators & Roles", path: "/platform/users", icon: Users, permitted: canManageUsers },
        { label: "System Health", path: "/platform/health", icon: HeartPulse, permitted: canHealth },
        { label: "Runtime Logs", path: "/platform/logs", icon: ScrollText, permitted: canHealth },
        { label: "Design System", path: "/platform/_design", icon: Palette, permitted: import.meta.env.DEV },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[var(--platform-surface)] border-r border-[var(--platform-border)] text-left select-none">
      {/* Brand Header */}
      <div className="h-12 px-3.5 flex items-center justify-between border-b border-[var(--platform-border-subtle)] shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 rounded-[var(--platform-radius-md)] bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs tracking-wider shrink-0 shadow-xs ring-1 ring-blue-500/30">
            LP
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <div className="text-xs font-semibold tracking-tight text-[var(--platform-text-primary)]">
                Platform Console
              </div>
              <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">
                {formatRole(user?.role)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="md:hidden p-1.5 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden md:flex p-1 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] cursor-pointer transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Navigation Groups */}
      <div
        className="flex-1 overflow-y-auto min-h-0 px-2 pt-2.5 pb-4 space-y-3"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--platform-border-strong) transparent",
        }}
      >
        {groups.map((group) => {
          const visibleItems = group.items.filter((item) => item.permitted);
          if (!visibleItems.length) return null;

          return (
            <div key={group.title} className="space-y-0.5">
              {!isCollapsed && (
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                  {group.title}
                </div>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-[var(--platform-radius-md)] text-xs font-medium transition-all group relative",
                        isActive
                          ? "bg-[var(--platform-accent-subtle)] text-[var(--platform-accent)] font-semibold shadow-2xs before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-[var(--platform-accent)] before:rounded-full"
                          : "text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)]/70",
                        isCollapsed && "justify-center px-1 before:hidden"
                      )
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0 text-current" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Operator Profile Footer */}
      <div className="p-2.5 border-t border-[var(--platform-border)] bg-[var(--platform-surface)] shrink-0">
        <div className={cn("flex items-center justify-between gap-2", isCollapsed && "flex-col")}>
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={user?.name || "Operator"} size="sm" status="online" />
            {!isCollapsed && (
              <div className="min-w-0 truncate text-left">
                <div className="text-xs font-semibold text-[var(--platform-text-primary)] truncate">
                  {user?.name || "Platform Operator"}
                </div>
                <div className="text-[10px] platform-mono text-[var(--platform-text-muted)] truncate">
                  {formatRole(user?.role)}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={logout}
              title="Logout from console"
              aria-label="Logout from console"
              className="p-1.5 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-danger)] hover:bg-[var(--platform-danger-subtle)] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col h-full shrink-0 transition-all duration-200 z-30",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-xs flex animate-in fade-in duration-150"
          onClick={onCloseMobile}
        >
          <div
            className="w-64 h-full animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
