import { cn } from "../lib/utils/cn";

export function Badge({
  children,
  className = "",
  variant = "neutral", // neutral | success | warning | danger | info | accent
  size = "md", // sm | md
  ...props
}) {
  const variantClasses = {
    neutral:
      "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-secondary)] border-[var(--platform-border)]",
    success:
      "bg-[var(--platform-success-subtle)] text-[var(--platform-success)] border-[var(--platform-success)]/30",
    warning:
      "bg-[var(--platform-warning-subtle)] text-[var(--platform-warning)] border-[var(--platform-warning)]/30",
    danger:
      "bg-[var(--platform-danger-subtle)] text-[var(--platform-danger)] border-[var(--platform-danger)]/30",
    info:
      "bg-[var(--platform-info-subtle)] text-[var(--platform-info)] border-[var(--platform-info)]/30",
    accent:
      "bg-[var(--platform-accent-subtle)] text-[var(--platform-accent)] border-[var(--platform-accent)]/30",
  }[variant] || "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-secondary)]";

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[11px] tracking-wide uppercase font-semibold whitespace-nowrap",
    md: "px-2 py-0.5 text-xs font-medium",
  }[size] || "px-2 py-0.5 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--platform-radius-sm)] border select-none leading-none platform-mono",
        sizeClasses,
        variantClasses,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusPill({
  status,
  label,
  variant,
  pulse = false,
  className = "",
}) {
  // Map common backend status values to visual semantic variants
  const resolvedVariant =
    variant ||
    (() => {
      switch (status) {
        case "active":
        case "confirmed":
        case "connected":
        case "healthy":
        case "operational":
          return "success";
        case "trial":
        case "pending":
        case "connecting":
          return "info";
        case "past_due":
        case "warning":
        case "maintenance":
        case "grace_period":
          return "warning";
        case "suspended":
        case "cancelled":
        case "rejected":
        case "failed":
        case "disabled":
        case "disconnected":
          return "danger";
        default:
          return "neutral";
      }
    })();

  const dotColorClasses = {
    neutral: "bg-[var(--platform-text-muted)]",
    success: "bg-[var(--platform-success)]",
    warning: "bg-[var(--platform-warning)]",
    danger: "bg-[var(--platform-danger)]",
    info: "bg-[var(--platform-info)]",
    accent: "bg-[var(--platform-accent)]",
  }[resolvedVariant] || "bg-[var(--platform-text-muted)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border select-none platform-mono",
        resolvedVariant === "success" && "bg-[var(--platform-success-subtle)] text-[var(--platform-success)] border-[var(--platform-success)]/20",
        resolvedVariant === "warning" && "bg-[var(--platform-warning-subtle)] text-[var(--platform-warning)] border-[var(--platform-warning)]/20",
        resolvedVariant === "danger" && "bg-[var(--platform-danger-subtle)] text-[var(--platform-danger)] border-[var(--platform-danger)]/20",
        resolvedVariant === "info" && "bg-[var(--platform-info-subtle)] text-[var(--platform-info)] border-[var(--platform-info)]/20",
        resolvedVariant === "accent" && "bg-[var(--platform-accent-subtle)] text-[var(--platform-accent)] border-[var(--platform-accent)]/20",
        resolvedVariant === "neutral" && "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-secondary)] border-[var(--platform-border)]",
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {pulse && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              dotColorClasses
            )}
          />
        )}
        <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", dotColorClasses)} />
      </span>
      <span className="capitalize">{label || status}</span>
    </span>
  );
}
