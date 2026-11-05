import { useState } from "react";
import {
  Menu,
  Search,
  Sun,
  Moon,
  Laptop,
  Layers,
  LogOut,
  User,
  Shield,
  HelpCircle,
} from "lucide-react";
import { usePlatformAuth } from "../lib/auth/AuthContext";
import { usePlatformTheme } from "../lib/theme/ThemeContext";
import { DropdownMenu } from "../ui/DropdownMenu";
import { Kbd } from "../ui/Kbd";
import { Badge } from "../ui/Badge";
import { Avatar } from "../ui/Avatar";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { cn } from "../lib/utils/cn";

export function TopBar({ onOpenMobile, onOpenCommandPalette, breadcrumbs = [] }) {
  const { user, logout } = usePlatformAuth();
  const { theme, setTheme, density, toggleDensity, resolvedTheme } = usePlatformTheme();

  return (
    <header className="sticky top-0 z-30 h-12 px-4 flex items-center justify-between gap-4 bg-[var(--platform-surface)]/95 backdrop-blur-md border-b border-[var(--platform-border)] select-none">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          className="md:hidden p-1.5 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-secondary)] hover:bg-[var(--platform-surface-subtle)]"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-2.5 py-1 text-xs rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] text-[var(--platform-text-muted)] border border-[var(--platform-border)] hover:border-[var(--platform-border-strong)] hover:text-[var(--platform-text-primary)] transition-all cursor-pointer shadow-2xs"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search console...</span>
          <div className="hidden sm:flex items-center gap-0.5 ml-1">
            <Kbd>Cmd</Kbd>
            <Kbd>K</Kbd>
          </div>
        </button>

        {/* Environment Indicator */}
        <Badge variant="success" size="sm" className="hidden sm:inline-flex">
          Production
        </Badge>

        {/* Density Mode Toggle */}
        <button
          type="button"
          onClick={toggleDensity}
          title={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
          className="p-1.5 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          className="p-1.5 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          )}
        </button>

        {/* User Dropdown */}
        <DropdownMenu
          trigger={
            <div className="flex items-center gap-2 cursor-pointer">
              <Avatar name={user?.name || "Super Admin"} size="sm" />
            </div>
          }
          items={[
            { header: true, label: user?.email || "Super Admin" },
            { label: "My Operator Profile", icon: User },
            { label: "Security & MFA", icon: Shield },
            { divider: true },
            { label: "Sign out", icon: LogOut, danger: true, onClick: logout },
          ]}
        />
      </div>
    </header>
  );
}
