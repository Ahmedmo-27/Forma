import { cn } from "../lib/utils/cn";

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}) {
  return (
    <div
      className={cn(
        "p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-2xs text-left space-y-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--platform-border-subtle)]">
        <div>
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)] tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-[var(--platform-text-muted)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Chart Canvas Area */}
      <div className="w-full min-h-[220px] flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
