import { useEffect } from "react";
import { Button } from "../ui/Button";
import { AlertCircle } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function FormLayout({
  title,
  description,
  onSubmit,
  isDirty = false,
  isSubmitting = false,
  onReset,
  children,
  saveLabel = "Save Changes",
  className = "",
}) {
  // Prevent accidental navigation when unsaved changes exist
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  return (
    <form onSubmit={onSubmit} className={cn("space-y-6 text-left max-w-4xl", className)}>
      {(title || description) && (
        <div className="pb-4 border-b border-[var(--platform-border-subtle)]">
          {title && (
            <h2 className="text-base font-semibold text-[var(--platform-text-primary)]">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-xs text-[var(--platform-text-muted)] mt-0.5">
              {description}
            </p>
          )}
        </div>
      )}

      {/* Sections Area */}
      <div className="space-y-6">{children}</div>

      {/* Sticky Save Bar (surfaces when isDirty) */}
      {isDirty && (
        <div className="sticky bottom-4 z-30 p-3 rounded-[var(--platform-radius-lg)] bg-[var(--platform-surface-raised)] border border-[var(--platform-border-strong)] flex items-center justify-between gap-4 shadow-xl animate-in slide-in-from-bottom duration-150">
          <div className="flex items-center gap-2 text-xs text-[var(--platform-warning)] font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>You have unsaved changes.</span>
          </div>

          <div className="flex items-center gap-2">
            {onReset && (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={isSubmitting}
                onClick={onReset}
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              type="submit"
              loading={isSubmitting}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export function FormSection({ title, description, children, className = "" }) {
  return (
    <div
      className={cn(
        "p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4",
        className
      )}
    >
      {(title || description) && (
        <div className="pb-3 border-b border-[var(--platform-border-subtle)]">
          {title && (
            <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-[var(--platform-text-muted)] mt-0.5">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
