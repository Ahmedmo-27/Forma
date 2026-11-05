import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { Popover } from "../ui/Popover";
import { cn } from "../lib/utils/cn";

export function KpiCard({
  title,
  value,
  delta, // e.g. "+12.4%"
  deltaType = "neutral", // "positive" | "negative" | "neutral"
  subtext,
  howCalculated,
  sparklineData = [], // array of numbers e.g. [10, 15, 12, 18, 22, 28, 25]
  icon: Icon,
  className = "",
}) {
  const gradientId = `spark-${(title || "kpi").toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  // Generate lightweight SVG path and area fill for sparkline
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 84;
    const height = 26;

    const points = sparklineData.map((val, idx) => {
      const x = (idx / (sparklineData.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    });

    const isPositive = deltaType === "positive";
    const strokeColor = isPositive ? "var(--platform-success)" : "var(--platform-accent)";

    return (
      <svg width={width} height={height} className="overflow-visible shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon
          fill={`url(#${gradientId})`}
          points={`0,${height} ${points.join(" ")} ${width},${height}`}
        />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.join(" ")}
        />
      </svg>
    );
  };

  return (
    <div
      className={cn(
        "p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-2xs text-left space-y-2 select-none platform-card-interactive hover:border-[var(--platform-border-strong)] transition-all duration-150",
        className
      )}
    >
      {/* Title & Info Popover */}
      <div className="flex items-center justify-between text-xs text-[var(--platform-text-secondary)]">
        <div className="flex items-center gap-1.5 font-medium">
          {Icon && <Icon className="w-3.5 h-3.5 text-[var(--platform-text-muted)]" />}
          <span>{title}</span>
        </div>

        {howCalculated && (
          <Popover
            align="end"
            trigger={
              <button
                type="button"
                className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] cursor-pointer p-0.5 rounded"
                title="How this metric is computed"
                aria-label={`How ${title} is calculated`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            }
            content={
              <div className="w-56 space-y-1">
                <div className="font-semibold text-xs text-[var(--platform-text-primary)]">
                  Calculation Definition
                </div>
                <div className="text-[11px] text-[var(--platform-text-muted)] leading-relaxed">
                  {howCalculated}
                </div>
              </div>
            }
          />
        )}
      </div>

      {/* Numerical Metric Value */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-[var(--platform-text-primary)] platform-mono">
          {value}
        </div>
        {renderSparkline()}
      </div>

      {/* Delta & Subtext */}
      {(delta || subtext) && (
        <div className="flex items-center gap-2 pt-1 border-t border-[var(--platform-border-subtle)] text-[11px]">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold platform-mono",
                deltaType === "positive" && "text-[var(--platform-success)]",
                deltaType === "negative" && "text-[var(--platform-danger)]",
                deltaType === "neutral" && "text-[var(--platform-text-muted)]"
              )}
            >
              {deltaType === "positive" ? (
                <TrendingUp className="w-3 h-3" />
              ) : deltaType === "negative" ? (
                <TrendingDown className="w-3 h-3" />
              ) : null}
              {delta}
            </span>
          )}
          {subtext && (
            <span className="text-[var(--platform-text-muted)] truncate">{subtext}</span>
          )}
        </div>
      )}
    </div>
  );
}
