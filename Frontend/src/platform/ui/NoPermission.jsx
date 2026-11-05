import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { cn } from "../lib/utils/cn";

export function NoPermission({
  requiredPermission,
  title = "Access Restricted",
  message = "Your current platform operator role does not grant permission to view or manage this section.",
  backTo = "/platform/dashboard",
  className = "",
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center select-none",
        className
      )}
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--platform-warning-subtle)] text-[var(--platform-warning)] border border-[var(--platform-warning)]/30 mb-3">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-[var(--platform-text-primary)]">
        {title}
      </h3>
      <p className="text-xs text-[var(--platform-text-muted)] max-w-sm mt-1 mb-3 leading-relaxed">
        {message}
      </p>

      {requiredPermission && (
        <div className="mb-6 flex items-center gap-2 text-xs text-[var(--platform-text-muted)]">
          <span>Required permission:</span>
          <Badge variant="warning">{requiredPermission}</Badge>
        </div>
      )}

      <Link to={backTo}>
        <Button size="sm" variant="outline" leftIcon={ArrowLeft}>
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
}
