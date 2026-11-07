import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils/cn";

export const Button = forwardRef(function Button(
  {
    children,
    className = "",
    variant = "primary", // primary | secondary | outline | ghost | danger | danger-outline
    size = "md", // xs | sm | md | lg
    loading = false,
    disabled = false,
    fullWidth = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    type = "button",
    ...props
  },
  ref
) {
  const baseClasses =
    "inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-[var(--platform-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--platform-surface)]";

  const sizeClasses = {
    xs: "h-8 px-2.5 text-xs rounded-[var(--platform-radius-sm)] gap-1.5",
    sm: "h-8 px-3 text-xs rounded-[var(--platform-radius-md)] gap-1.5",
    md: "h-9 px-3.5 text-xs rounded-[var(--platform-radius-md)] gap-2",
    lg: "h-10 px-4 text-sm rounded-[var(--platform-radius-md)] gap-2.5",
  }[size] || "h-9 px-3.5 text-xs";

  const variantClasses = {
    primary:
      "bg-[var(--platform-accent)] text-[var(--platform-accent-fg)] hover:bg-[var(--platform-accent-hover)] active:scale-[0.98] border border-transparent shadow-xs",
    secondary:
      "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-primary)] hover:bg-[var(--platform-border-strong)]/20 border border-[var(--platform-border)] active:scale-[0.98]",
    outline:
      "bg-transparent text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] border border-[var(--platform-border)] active:scale-[0.98]",
    ghost:
      "bg-transparent text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] border border-transparent",
    danger:
      "bg-[var(--platform-danger)] text-white hover:opacity-90 active:scale-[0.98] border border-transparent shadow-xs",
    "danger-outline":
      "bg-transparent text-[var(--platform-danger)] hover:bg-[var(--platform-danger-subtle)] border border-[var(--platform-danger)]/40 active:scale-[0.98]",
  }[variant] || "bg-[var(--platform-accent)] text-white";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        baseClasses,
        sizeClasses,
        variantClasses,
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-current" />
      ) : LeftIcon ? (
        <LeftIcon className="w-3.5 h-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
      {!loading && RightIcon && (
        <RightIcon className="w-3.5 h-3.5 shrink-0" />
      )}
    </button>
  );
});
