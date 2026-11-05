import { forwardRef } from "react";
import { cn } from "../lib/utils/cn";

export const Switch = forwardRef(function Switch(
  {
    className = "",
    label,
    description,
    checked = false,
    onChange,
    disabled = false,
    id,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex items-start justify-between gap-4 cursor-pointer select-none group text-left",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {(label || description) && (
        <div className="text-xs flex-1">
          {label && (
            <div className="font-medium text-[var(--platform-text-primary)] leading-tight">
              {label}
            </div>
          )}
          {description && (
            <div className="text-[11px] text-[var(--platform-text-muted)] mt-0.5 leading-snug">
              {description}
            </div>
          )}
        </div>
      )}

      <div className="relative inline-flex items-center shrink-0 mt-0.5">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange?.(e.target.checked)}
          className="sr-only"
          {...props}
        />
        <div
          className={cn(
            "w-8 h-4.5 rounded-full transition-colors duration-200 border",
            checked
              ? "bg-[var(--platform-accent)] border-[var(--platform-accent)]"
              : "bg-[var(--platform-surface-subtle)] border-[var(--platform-border-strong)]",
            "group-focus-within:ring-2 group-focus-within:ring-[var(--platform-accent)]/20"
          )}
        >
          <div
            className={cn(
              "w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 shadow-xs mt-[1px]",
              checked ? "translate-x-3.5" : "translate-x-0.5"
            )}
          />
        </div>
      </div>
    </label>
  );
});
