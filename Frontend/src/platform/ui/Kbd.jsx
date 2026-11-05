import { cn } from "../lib/utils/cn";

export function Kbd({ children, className = "" }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-semibold platform-mono rounded-[var(--platform-radius-sm)] select-none",
        "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-muted)] border border-[var(--platform-border-strong)] shadow-xs",
        className
      )}
    >
      {children}
    </kbd>
  );
}
