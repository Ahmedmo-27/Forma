import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
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
  Plus,
  ArrowRight,
  Command,
  HelpCircle,
  X,
} from "lucide-react";
import { usePermission } from "../lib/auth/PermissionContext";
import { apiGetTenants } from "../lib/api/endpoints";
import { Kbd } from "../ui/Kbd";
import { cn } from "../lib/utils/cn";

export function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tenantResults, setTenantResults] = useState([]);
  const [isSearchingTenants, setIsSearchingTenants] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const inputRef = useRef(null);

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

  // Keyboard shortcut listener (Cmd+K / Ctrl+K and ?)
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onClose?.(!isOpen);
      } else if (e.key === "?" && !isOpen && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        setShowShortcutsHelp(true);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search for tenants when query is typed
  useEffect(() => {
    if (!query.trim() || query.length < 2 || !canReadTenants) {
      setTenantResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingTenants(true);
        const res = await apiGetTenants({ search: query.trim(), limit: 5 });
        setTenantResults(res.data?.tenants || []);
      } catch {
        // quiet failure in command palette search
      } finally {
        setIsSearchingTenants(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, canReadTenants]);

  const navItems = [
    { label: "Executive Dashboard", path: "/platform/dashboard", icon: LayoutDashboard, permitted: canReadTenants },
    { label: "Subscribers & Gyms", path: "/platform/tenants", icon: Building2, permitted: canReadTenants },
    { label: "Plans & Features Catalog", path: "/platform/plans-features", icon: Package, permitted: canManagePlans },
    { label: "Pricing Tiers & Coupons", path: "/platform/pricing-coupons", icon: Tags, permitted: canManagePricing },
    { label: "Manual Payments & Invoices", path: "/platform/payments-invoices", icon: CreditCard, permitted: canManagePayments },
    { label: "Append-Only Billing Ledger", path: "/platform/ledger", icon: BookOpen, permitted: canViewLedger },
    { label: "Consumption & Cost Telemetry", path: "/platform/usage", icon: Activity, permitted: canReadTenants },
    { label: "Support & Impersonation", path: "/platform/support", icon: Headphones, permitted: canSupport },
    { label: "Broadcast Announcements", path: "/platform/announcements", icon: Megaphone, permitted: canAnnounce },
    { label: "Security & Operations Audit Trail", path: "/platform/audit", icon: ShieldCheck, permitted: canAudit },
    { label: "Platform Users & Roles", path: "/platform/users", icon: Users, permitted: canManageUsers },
    { label: "System Health & Settings", path: "/platform/health", icon: HeartPulse, permitted: canHealth },
    { label: "Runtime Logs", path: "/platform/logs", icon: ScrollText, permitted: canHealth },
  ].filter((item) => item.permitted);

  const filteredNav = navItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const allItems = [
    ...filteredNav.map((n) => ({ type: "nav", ...n })),
    ...tenantResults.map((t) => ({
      type: "tenant",
      label: t.name,
      sublabel: `/${t.slug} • ${t.owner?.email || "No owner email"}`,
      path: `/platform/tenants/${t.id}`,
      icon: Building2,
    })),
  ];

  const handleSelect = (item) => {
    if (!item) return;
    navigate(item.path);
    onClose?.(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(allItems[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose?.(false);
    }
  };

  if (!isOpen && !showShortcutsHelp) return null;

  if (showShortcutsHelp) {
    return (
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={() => setShowShortcutsHelp(false)}
      >
        <div
          role="dialog"
          aria-labelledby="shortcuts-title"
          className="w-full max-w-md rounded-[var(--platform-radius-xl)] bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] p-5 text-left text-xs"
          style={{ boxShadow: "var(--platform-shadow-dialog)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--platform-border-subtle)]">
            <h3 id="shortcuts-title" className="font-semibold text-sm text-[var(--platform-text-primary)] flex items-center gap-2">
              <Command className="w-4 h-4 text-[var(--platform-accent)]" />
              Keyboard Shortcuts
            </h3>
            <button
              type="button"
              onClick={() => setShowShortcutsHelp(false)}
              aria-label="Close shortcuts dialog"
              className="p-1 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2.5 mt-4">
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--platform-text-secondary)]">Open Command Palette</span>
              <div className="flex gap-1">
                <Kbd>Cmd</Kbd>
                <Kbd>K</Kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--platform-text-secondary)]">Show Keyboard Shortcuts</span>
              <Kbd>?</Kbd>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--platform-text-secondary)]">Close Active Modal / Palette</span>
              <Kbd>Esc</Kbd>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => onClose?.(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="w-full max-w-xl rounded-[var(--platform-radius-xl)] bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] text-left overflow-hidden animate-in zoom-in-95 duration-150"
        style={{ boxShadow: "var(--platform-shadow-dialog)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--platform-border-subtle)]">
          <Search className="w-4 h-4 text-[var(--platform-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, jump to a page, or search gyms by name/slug..."
            className="w-full bg-transparent text-xs text-[var(--platform-text-primary)] placeholder-[var(--platform-text-muted)] outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--platform-text-muted)]">
              No matching actions or subscribers.
            </div>
          ) : (
            allItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={`${item.type}-${item.path || index}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-[var(--platform-radius-md)] text-xs cursor-pointer select-none transition-colors",
                    isSelected
                      ? "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-primary)]"
                      : "text-[var(--platform-text-secondary)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-[var(--platform-text-muted)]" />
                    <div className="truncate">
                      <div className="font-medium text-[var(--platform-text-primary)] truncate">
                        {item.label}
                      </div>
                      {item.sublabel && (
                        <div className="text-[11px] platform-mono text-[var(--platform-text-muted)] truncate">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.type === "tenant" && (
                      <span className="text-[10px] platform-mono text-[var(--platform-accent)]">
                        Gym
                      </span>
                    )}
                    {isSelected && (
                      <ArrowRight className="w-3.5 h-3.5 text-[var(--platform-accent)]" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--platform-border-subtle)] bg-[var(--platform-surface-subtle)]/50 text-[10px] text-[var(--platform-text-muted)]">
          <div className="flex items-center gap-3">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> Navigate
            </span>
            <span>
              <Kbd>↵</Kbd> Open
            </span>
          </div>
          <span>Super Admin Console</span>
        </div>
      </div>
    </div>
  );
}
