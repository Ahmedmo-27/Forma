import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md", // sm (360px), md (480px), lg (640px)
  className = "",
}) {
  const drawerRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }

    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-xl",
  }[width] || "max-w-md";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "w-full h-full bg-[var(--platform-surface-raised)] border-l border-[var(--platform-border)] flex flex-col text-left outline-none shadow-2xl animate-in slide-in-from-right duration-200",
          widthClasses,
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--platform-border-subtle)]">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-[var(--platform-text-primary)]">
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
            aria-label="Close drawer"
            className="p-1 rounded-[var(--platform-radius-sm)] text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto text-xs text-[var(--platform-text-secondary)] space-y-4">
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
