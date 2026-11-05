import { useState, useEffect } from "react";
import { ShieldAlert, LogOut, Clock, ExternalLink } from "lucide-react";
import { Button } from "../ui/Button";
import { usePlatformAuth } from "../lib/auth/AuthContext";
import { cn } from "../lib/utils/cn";

export function ImpersonationBanner() {
  const { impersonation, exitImpersonation } = usePlatformAuth();
  const [secondsRemaining, setSecondsRemaining] = useState(30 * 60);

  useEffect(() => {
    if (!impersonation) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          exitImpersonation();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [impersonation, exitImpersonation]);

  if (!impersonation) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  const isReadOnly = impersonation.mode !== "read_write";
  const tenantName = impersonation.tenant?.name || impersonation.tenantName || "Gym Tenant";
  const tenantSlug = impersonation.tenant?.slug || impersonation.tenantSlug || "";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full z-40 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs select-none",
        "bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200"
      )}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="font-semibold">
          Active Support Impersonation:
        </span>
        <span className="platform-mono font-medium">
          {tenantName} {tenantSlug && `(/${tenantSlug})`}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.2 rounded-full text-[10px] platform-mono font-bold uppercase",
            isReadOnly
              ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30"
              : "bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/30"
          )}
        >
          {isReadOnly ? "Read-Only Inspection" : "Read-Write Super Admin"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 platform-mono text-[11px] text-amber-700 dark:text-amber-300">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Expires in {timeFormatted}</span>
        </div>

        <a
          href="/members"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline"
        >
          <span>Open Gym Portal</span>
          <ExternalLink className="w-3 h-3" />
        </a>

        <Button
          size="xs"
          variant="outline"
          leftIcon={LogOut}
          onClick={exitImpersonation}
          className="border-amber-500/40 hover:bg-amber-500/20 text-amber-900 dark:text-amber-100"
        >
          Exit View
        </Button>
      </div>
    </div>
  );
}
