import { forwardRef, useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "../lib/utils/cn";

export const Checkbox = forwardRef(function Checkbox(
  {
    className = "",
    label,
    description,
    checked = false,
    indeterminate = false,
    onChange,
    onCheckedChange,
    disabled = false,
    id,
    ...props
  },
  ref
) {
  const internalRef = useRef(null);
  const resolvedRef = ref || internalRef;
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  useEffect(() => {
    if (resolvedRef.current) {
      resolvedRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate, resolvedRef]);

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex items-start gap-2.5 cursor-pointer select-none group text-left",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          ref={resolvedRef}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            if (disabled) return;
            const next = e.target.checked;
            onChange?.(next);
            onCheckedChange?.(next);
          }}
          className="sr-only"
          {...props}
        />
        <div
          className={cn(
            "w-4 h-4 rounded-[var(--platform-radius-sm)] border transition-all duration-150 flex items-center justify-center",
            checked || indeterminate
              ? "bg-[var(--platform-accent)] border-[var(--platform-accent)] text-white shadow-xs"
              : "bg-[var(--platform-surface)] border-[var(--platform-border-strong)] group-hover:border-[var(--platform-text-muted)]",
            "group-focus-within:ring-2 group-focus-within:ring-[var(--platform-accent)]/20"
          )}
        >
          {indeterminate ? (
            <Minus className="w-3 h-3 stroke-[3]" />
          ) : checked ? (
            <Check className="w-3 h-3 stroke-[3]" />
          ) : null}
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
