import { Menu, Search, Sun, Moon, Laptop, LogOut } from "lucide-react";
import { usePlatformAuth } from "../lib/auth/AuthContext";
import { usePlatformTheme } from "../lib/theme/ThemeContext";
import { DropdownMenu } from "../ui/DropdownMenu";
import { Kbd } from "../ui/Kbd";
import { Avatar } from "../ui/Avatar";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { modifierKeyLabel } from "../lib/utils/shortcut";

const iconButtonClass =
  "inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-8 sm:min-h-8 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer";

function themeCycle(theme) {
  if (theme === "system") return "light";
  if (theme === "light") return "dark";
  return "system";
}

function themeLabel(theme) {
  if (theme === "system") return "System";
  if (theme === "dark") return "Dark";
  return "Light";
}

export function TopBar({ onOpenMobile, onOpenCommandPalette, breadcrumbs = [], systemHealth }) {
  const { user, logout } = usePlatformAuth();
  const { theme, setTheme, density, toggleDensity } = usePlatformTheme();
  const modKey = modifierKeyLabel();

  const maintenanceOn = Boolean(systemHealth?.maintenance?.enabled);
  const databaseStatus = systemHealth?.database?.status;
  const databaseDown =
    typeof databaseStatus === "string" &&
    /down|error|disconnected|fail/i.test(databaseStatus);

  let statusLabel = "Checking status";
  let statusClass = "bg-[var(--platform-text-muted)]";
  if (!systemHealth) {
    statusLabel = "Status unavailable";
  } else if (maintenanceOn) {
    statusLabel = "Maintenance";
    statusClass = "bg-[var(--platform-warning)]";
  } else if (databaseDown) {
    statusLabel = "Database issue";
    statusClass = "bg-[var(--platform-danger)]";
  } else if (databaseStatus) {
    statusLabel = "Operational";
    statusClass = "bg-[var(--platform-success)]";
  }

  const nextTheme = themeCycle(theme);

  return (
    <header className="sticky top-0 z-30 min-h-14 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 bg-[var(--platform-surface)]/95 backdrop-blur-md border-b border-[var(--platform-border)]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          className={`md:hidden ${iconButtonClass}`}
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label={`Search console (${modKey}+K)`}
          className="flex items-center gap-2 h-8 px-2.5 text-xs rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] text-[var(--platform-text-secondary)] border border-[var(--platform-border)] hover:border-[var(--platform-border-strong)] hover:text-[var(--platform-text-primary)] transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Search console</span>
          <span className="hidden sm:flex items-center gap-0.5">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div
          className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-[var(--platform-surface-subtle)] border border-[var(--platform-border)] text-[11px] font-medium text-[var(--platform-text-secondary)]"
          role="status"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusClass}`} aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>

        <button
          type="button"
          onClick={toggleDensity}
          aria-label={`Density is ${density}. Switch to ${density === "comfortable" ? "compact" : "comfortable"} density.`}
          className={`hidden sm:inline-flex ${iconButtonClass}`}
        >
          <span className="text-[11px] font-semibold tracking-wide">
            {density === "comfortable" ? "Comfort" : "Compact"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTheme(nextTheme)}
          aria-label={`Theme is ${themeLabel(theme)}. Switch to ${themeLabel(nextTheme)}.`}
          className={iconButtonClass}
        >
          {theme === "dark" ? (
            <Moon className="w-4 h-4" />
          ) : theme === "light" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Laptop className="w-4 h-4" />
          )}
        </button>

        <DropdownMenu
          trigger={
            <button
              type="button"
              aria-label="Operator account menu"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-8 sm:min-h-8 rounded-full cursor-pointer hover:ring-2 hover:ring-[var(--platform-accent)]/30 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--platform-accent)]"
            >
              <Avatar name={user?.name || "Operator"} size="sm" />
            </button>
          }
          items={[
            { header: true, label: user?.name || "Platform operator" },
            { header: true, label: user?.email || "Signed in" },
            { divider: true },
            { label: "Sign out", icon: LogOut, danger: true, onClick: logout },
          ]}
        />
      </div>
    </header>
  );
}
