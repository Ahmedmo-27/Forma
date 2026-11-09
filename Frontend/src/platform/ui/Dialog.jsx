import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md", // sm | md | lg | xl
  className = "",
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
      }
    }

    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
      dialogRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size] || "max-w-lg";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dialog-title" : undefined}
        tabIndex={-1}
        className={cn(
          "w-full rounded-[var(--platform-radius-xl)] bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] text-left outline-none overflow-hidden animate-in zoom-in-95 duration-150",
          sizeClasses,
          className
        )}
        style={{ boxShadow: "var(--platform-shadow-dialog)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 pb-3 border-b border-[var(--platform-border-subtle)]">
          <div>
            {title && (
              <h2
                id="dialog-title"
                className="text-sm font-semibold text-[var(--platform-text-primary)] tracking-tight"
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-[var(--platform-text-muted)] mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-[36px] min-h-[36px] sm:min-w-7 sm:min-h-7 flex items-center justify-center rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 text-xs text-[var(--platform-text-secondary)] max-h-[calc(85vh-120px)] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 p-3 bg-[var(--platform-surface-subtle)]/50 border-t border-[var(--platform-border-subtle)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
