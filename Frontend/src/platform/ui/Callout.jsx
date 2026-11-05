import { Info, AlertTriangle, AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function Callout({
  variant = "info", // info | warning | danger | success
  title,
  children,
  onDismiss,
  className = "",
}) {
  const Icon = {
    info: Info,
    warning: AlertTriangle,
    danger: AlertCircle,
    success: CheckCircle2,
  }[variant] || Info;

  const styleClasses = {
    info: "bg-[var(--platform-info-subtle)] border-[var(--platform-info)]/30 text-[var(--platform-info)]",
    warning: "bg-[var(--platform-warning-subtle)] border-[var(--platform-warning)]/30 text-[var(--platform-warning)]",
    danger: "bg-[var(--platform-danger-subtle)] border-[var(--platform-danger)]/30 text-[var(--platform-danger)]",
    success: "bg-[var(--platform-success-subtle)] border-[var(--platform-success)]/30 text-[var(--platform-success)]",
  }[variant] || "bg-[var(--platform-info-subtle)]";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 p-3.5 rounded-[var(--platform-radius-lg)] border text-left text-xs",
        styleClasses,
        className
      )}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 text-[var(--platform-text-secondary)] leading-relaxed">
        {title && (
          <h4 className="font-semibold text-[var(--platform-text-primary)] mb-0.5">
            {title}
          </h4>
        )}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] transition-colors p-0.5 cursor-pointer rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
