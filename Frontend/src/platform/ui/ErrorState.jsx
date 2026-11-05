import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../lib/utils/cn";

export function ErrorState({
  title = "Failed to load data",
  message = "An error occurred while fetching information from the platform API.",
  onRetry,
  className = "",
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center py-10 px-4 text-center rounded-[var(--platform-radius-lg)] border border-[var(--platform-danger)]/30 bg-[var(--platform-danger-subtle)]/40",
        className
      )}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--platform-danger-subtle)] text-[var(--platform-danger)] mb-3 border border-[var(--platform-danger)]/30">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
        {title}
      </h3>
      <p className="text-xs text-[var(--platform-text-muted)] max-w-sm mt-1 mb-4 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          leftIcon={RefreshCw}
          onClick={onRetry}
        >
          Try Again
        </Button>
      )}
    </div>
  );
}
