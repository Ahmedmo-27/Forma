import { Inbox } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function EmptyState({
  icon: Icon = Inbox,
  title = "No data found",
  description = "No entries match your search criteria or current filters.",
  action,
  className = "",
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center select-none",
        className
      )}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--platform-surface-subtle)] border border-[var(--platform-border)] text-[var(--platform-text-muted)] mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--platform-text-muted)] max-w-sm mt-1 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
