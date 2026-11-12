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
import { Avatar } from "../ui/Avatar";
import { cn } from "../lib/utils/cn";

function formatRole(role) {
  if (!role) return "Operator";
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const iconButtonClass =
  "inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-8 sm:min-h-8 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer";

function SidebarFrame({ collapsed, showMobileClose, onToggleCollapse, onCloseMobile }) {
  const { user, logout } = usePlatformAuth();

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

  return (
    <div className="flex flex-col h-full bg-[var(--platform-surface)] border-r border-[var(--platform-border)] text-left select-none">
      <div className="h-14 px-3 flex items-center justify-between border-b border-[var(--platform-border-subtle)] shrink-0 gap-2">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          <img src="/forma-favicon.png" alt="" className="w-8 h-8 rounded-[var(--platform-radius-md)] object-cover shrink-0" />
          {!collapsed && (
            <div className="truncate">
              <div className="text-sm font-semibold tracking-tight text-[var(--platform-text-primary)]">
                Platform Console
              </div>
              <div className="text-[11px] text-[var(--platform-text-muted)]">
                {formatRole(user?.role)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center">
          {showMobileClose && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation"
              className={iconButtonClass}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(iconButtonClass, "hidden md:inline-flex")}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      <nav
        aria-label="Platform"
        className="flex-1 overflow-y-auto min-h-0 px-2 py-3 space-y-4"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--platform-border-strong) transparent",
        }}
      >
        {groups.map((group, groupIndex) => {
          const visibleItems = group.items.filter((item) => item.permitted);
          if (!visibleItems.length) return null;
          const earlierGroupVisible = groups
            .slice(0, groupIndex)
            .some((earlier) => earlier.items.some((item) => item.permitted));

          return (
            <div key={group.title} className="space-y-1">
              {collapsed ? (
                earlierGroupVisible && (
                  <div className="mx-2 mb-1 h-px bg-[var(--platform-border-subtle)]" aria-hidden="true" />
                )
              ) : (
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
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
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 min-h-11 sm:min-h-9 px-3 sm:px-2.5 py-2.5 sm:py-2 rounded-[var(--platform-radius-md)] text-[13px] font-medium transition-colors group relative",
                        isActive
                          ? "bg-[var(--platform-accent-subtle)] text-[var(--platform-accent)] font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--platform-accent)] before:rounded-full"
                          : "text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)]",
                        collapsed && "justify-center px-1 before:hidden"
                      )
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-[var(--platform-border)] bg-[var(--platform-surface)] shrink-0">
        <div className={cn("flex items-center justify-between gap-2", collapsed && "flex-col")}>
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={user?.name || "Operator"} size="sm" status="online" />
            {!collapsed && (
              <div className="min-w-0 truncate text-left">
                <div className="text-xs font-semibold text-[var(--platform-text-primary)] truncate">
                  {user?.name || "Platform Operator"}
                </div>
                <div className="text-[11px] text-[var(--platform-text-muted)] truncate">
                  {formatRole(user?.role)}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={logout}
            aria-label="Log out of the console"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-8 sm:min-h-8 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-danger)] hover:bg-[var(--platform-danger-subtle)] transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) {
  return (
    <>
      <aside
        className={cn(
          "hidden md:flex flex-col h-full shrink-0 transition-[width] duration-200 z-30",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarFrame
          collapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          onCloseMobile={onCloseMobile}
        />
      </aside>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-black/60 flex"
          onClick={onCloseMobile}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Platform navigation"
            className="w-72 max-w-[85vw] h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarFrame
              collapsed={false}
              showMobileClose
              onCloseMobile={onCloseMobile}
            />
          </div>
        </div>
      )}
    </>
  );
}
