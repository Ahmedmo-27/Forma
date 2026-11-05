import toast, { Toaster as HotToaster } from "react-hot-toast";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export function PlatformToaster() {
  return (
    <HotToaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "var(--platform-surface-raised)",
          color: "var(--platform-text-primary)",
          border: "1px solid var(--platform-border)",
          boxShadow: "var(--platform-shadow-popover)",
          borderRadius: "var(--platform-radius-lg)",
          fontSize: "12px",
          padding: "10px 14px",
          fontFamily: "inherit",
        },
      }}
    />
  );
}

export const platformToast = {
  success: (message, options = {}) =>
    toast(
      (t) => (
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[var(--platform-success)] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{message}</div>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      options
    ),

  error: (message, options = {}) =>
    toast(
      (t) => (
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[var(--platform-danger)] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{message}</div>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      options
    ),

  warning: (message, options = {}) =>
    toast(
      (t) => (
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[var(--platform-warning)] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{message}</div>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      options
    ),

  info: (message, options = {}) =>
    toast(
      (t) => (
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[var(--platform-info)] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{message}</div>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      options
    ),
};
