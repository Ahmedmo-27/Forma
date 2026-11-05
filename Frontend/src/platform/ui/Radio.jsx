import { forwardRef } from "react";
import { cn } from "../lib/utils/cn";

export const Radio = forwardRef(function Radio(
  {
    className = "",
    label,
    description,
    name,
    value,
    checked = false,
    onChange,
    disabled = false,
    id,
    ...props
  },
  ref
) {
  const inputId = id || (name && value ? `${name}-${value}` : undefined);

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex items-start gap-2.5 cursor-pointer select-none group text-left",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange?.(e.target.value)}
          className="sr-only"
          {...props}
        />
        <div
          className={cn(
            "w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center",
            checked
              ? "border-[var(--platform-accent)] bg-[var(--platform-surface)]"
              : "border-[var(--platform-border-strong)] bg-[var(--platform-surface)] group-hover:border-[var(--platform-text-muted)]",
            "group-focus-within:ring-2 group-focus-within:ring-[var(--platform-accent)]/20"
          )}
        >
          {checked && (
            <div className="w-2 h-2 rounded-full bg-[var(--platform-accent)]" />
          )}
        </div>
      </div>

      {(label || description) && (
        <div className="text-xs">
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
    </label>
  );
});
