import { createContext, useContext, useState } from "react";
import { cn } from "../lib/utils/cn";

const TabsContext = createContext(null);

export function Tabs({
  value: controlledValue,
  defaultValue,
  onChange,
  children,
  className = "",
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const activeTab = isControlled ? controlledValue : internalValue;

  const setActiveTab = (val) => {
    if (!isControlled) setInternalValue(val);
    onChange?.(val);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full space-y-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = "" }) {
  return (
    <div className="w-full max-w-full overflow-x-auto">
      <div
        role="tablist"
        className={cn(
          "inline-flex w-max min-w-full items-center gap-1 p-1 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function TabTrigger({ value, children, icon: Icon, badge, className = "" }) {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={cn(
        "inline-flex items-center gap-2 shrink-0 whitespace-nowrap min-h-9 px-3 py-1.5 text-xs font-medium rounded-[var(--platform-radius-sm)] transition-colors cursor-pointer select-none",
        isActive
          ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] font-semibold shadow-xs border border-[var(--platform-border-subtle)]"
          : "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface)]/50",
        className
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{children}</span>
      {badge !== undefined && (
        <span
          className={cn(
            "px-1.5 py-0.5 text-[11px] platform-mono rounded-full whitespace-nowrap",
            isActive
              ? "bg-[var(--platform-accent-subtle)] text-[var(--platform-accent)]"
              : "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-muted)]"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function TabContent({ value, children, className = "" }) {
  const { activeTab } = useContext(TabsContext);
  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" tabIndex={0} className={cn("outline-none animate-in fade-in duration-150", className)}>
      {children}
    </div>
  );
}
