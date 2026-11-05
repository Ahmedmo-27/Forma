import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils/cn";

export function MaintenanceBanner({ isEnabled, message = "Scheduled system maintenance active." }) {
  if (!isEnabled) return null;

  return (
    <div
      role="alert"
      className={cn(
        "w-full z-40 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs select-none",
        "bg-rose-500/15 border-b border-rose-500/30 text-rose-900 dark:text-rose-200"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
        </span>
        <span className="font-semibold uppercase tracking-wider text-[11px]">
          Global Maintenance Gate Active:
        </span>
        <span className="italic">{message}</span>
      </div>

      <Link
        to="/platform/health"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 dark:text-rose-300 hover:underline"
      >
        <span>Manage Maintenance Gate</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
