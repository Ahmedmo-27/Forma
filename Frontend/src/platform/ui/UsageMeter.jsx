import { cn } from "../lib/utils/cn";

export function UsageMeter({
  current = 0,
  max = 100,
  label,
  unit = "",
  showPercentage = true,
  className = "",
}) {
  const isUnlimited = max === null || max === undefined || max === 0;
  const ratio = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100));
  const isWarning = ratio >= 80 && ratio < 100;
  const isDanger = ratio >= 100;

  return (
    <div className={cn("space-y-1.5 text-left", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--platform-text-secondary)]">
          {label}
        </span>
        <div className="platform-mono text-[11px]">
          <span className="font-semibold text-[var(--platform-text-primary)]">
            {current.toLocaleString()}
          </span>
          <span className="text-[var(--platform-text-muted)]">
            {" "}
            / {isUnlimited ? "Unlimited" : `${max.toLocaleString()} ${unit}`}
          </span>
          {showPercentage && !isUnlimited && (
            <span
              className={cn(
                "ml-1.5 font-medium",
                isDanger
                  ? "text-[var(--platform-danger)]"
                  : isWarning
                  ? "text-[var(--platform-warning)]"
                  : "text-[var(--platform-text-muted)]"
              )}
            >
              ({ratio}%)
            </span>
          )}
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isDanger
              ? "bg-[var(--platform-danger)]"
              : isWarning
              ? "bg-[var(--platform-warning)]"
              : "bg-[var(--platform-accent)]"
          )}
          style={{ width: `${isUnlimited ? (current > 0 ? 100 : 0) : ratio}%` }}
        />
      </div>
    </div>
  );
}
