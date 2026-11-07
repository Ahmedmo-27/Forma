import { forwardRef } from "react";
import { cn } from "../lib/utils/cn";

export const Input = forwardRef(function Input(
  {
    className = "",
    type = "text",
    label,
    error,
    helperText,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    rightElement,
    isMono = false,
    required = false,
    id,
    disabled = false,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

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
        </div>
      )}

      <div className="relative flex items-center">
        {LeftIcon && (
          <div className="absolute left-2.5 flex items-center pointer-events-none text-[var(--platform-text-muted)]">
            <LeftIcon className="w-3.5 h-3.5" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          className={cn(
            "w-full h-[var(--platform-input-h)] px-3 text-xs rounded-[var(--platform-radius-md)]",
            "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] placeholder-[var(--platform-text-muted)]",
            "border border-[var(--platform-border-strong)] transition-all duration-150 outline-none",
            "focus:border-[var(--platform-accent)] focus:ring-2 focus:ring-[var(--platform-accent)]/20",
            "disabled:opacity-50 disabled:bg-[var(--platform-surface-subtle)] disabled:cursor-not-allowed",
            error && "border-[var(--platform-danger)] focus:border-[var(--platform-danger)] focus:ring-[var(--platform-danger)]/20",
            LeftIcon && "pl-8",
            (RightIcon || rightElement) && "pr-11",
            isMono && "platform-mono text-[11px]",
            className
          )}
          {...props}
        />

        {RightIcon && !rightElement && (
          <div className="absolute right-2.5 flex items-center pointer-events-none text-[var(--platform-text-muted)]">
            <RightIcon className="w-3.5 h-3.5" />
          </div>
        )}

        {rightElement && (
          <div className="absolute right-2 flex items-center">{rightElement}</div>
        )}
      </div>

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
