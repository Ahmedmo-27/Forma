import { forwardRef } from "react";
import { cn } from "../lib/utils/cn";

export const Textarea = forwardRef(function Textarea(
  {
    className = "",
    label,
    error,
    helperText,
    isMono = false,
    required = false,
    id,
    disabled = false,
    rows = 3,
    maxLength,
    value,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const currentLength = typeof value === "string" ? value.length : 0;

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-[var(--platform-text-secondary)] select-none"
          >
            {label} {required && <span className="text-[var(--platform-danger)]">*</span>}
          </label>
          {maxLength && (
            <span className="text-[10px] platform-mono text-[var(--platform-text-muted)]">
              {currentLength}/{maxLength}
            </span>
          )}
        </div>
      )}

      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        className={cn(
          "w-full p-2.5 text-xs rounded-[var(--platform-radius-md)]",
          "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] placeholder-[var(--platform-text-muted)]",
          "border border-[var(--platform-border-strong)] transition-all duration-150 outline-none resize-y min-h-[72px]",
          "focus:border-[var(--platform-accent)] focus:ring-2 focus:ring-[var(--platform-accent)]/20",
          "disabled:opacity-50 disabled:bg-[var(--platform-surface-subtle)] disabled:cursor-not-allowed",
          error && "border-[var(--platform-danger)] focus:border-[var(--platform-danger)] focus:ring-[var(--platform-danger)]/20",
          isMono && "platform-mono text-[11px]",
          className
        )}
        {...props}
      />

      {error ? (
        <p id={`${inputId}-error`} className="text-[11px] text-[var(--platform-danger)] font-medium">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="text-[11px] text-[var(--platform-text-muted)]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
