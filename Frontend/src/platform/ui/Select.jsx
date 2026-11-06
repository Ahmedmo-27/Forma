import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils/cn";

export const Select = forwardRef(function Select(
  {
    className = "",
    label,
    options = [],
    children,
    error,
    helperText,
    required = false,
    id,
    disabled = false,
    placeholder,
    ...props
  },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-medium text-[var(--platform-text-secondary)] select-none"
        >
          {label} {required && <span className="text-[var(--platform-danger)]">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={cn(
            "w-full h-[var(--platform-input-h)] pl-3 pr-8 text-xs rounded-[var(--platform-radius-md)] appearance-none cursor-pointer",
            "bg-[var(--platform-surface)] text-[var(--platform-text-primary)]",
            "border border-[var(--platform-border-strong)] transition-all duration-150 outline-none",
            "focus:border-[var(--platform-accent)] focus:ring-2 focus:ring-[var(--platform-accent)]/20",
            "disabled:opacity-50 disabled:bg-[var(--platform-surface-subtle)] disabled:cursor-not-allowed",
            error && "border-[var(--platform-danger)] focus:border-[var(--platform-danger)]",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => {
            const val = typeof opt === "object" ? opt.value : opt;
            const lbl = typeof opt === "object" ? opt.label : opt;
            const optDisabled = typeof opt === "object" ? opt.disabled : false;
            return (
              <option key={val} value={val} disabled={optDisabled}>
                {lbl}
              </option>
            );
          })}
          {children}
        </select>

        <div className="absolute right-2.5 pointer-events-none text-[var(--platform-text-muted)]">
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>

      {error ? (
        <p className="text-[11px] text-[var(--platform-danger)] font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-[11px] text-[var(--platform-text-muted)]">{helperText}</p>
      ) : null}
    </div>
  );
});
