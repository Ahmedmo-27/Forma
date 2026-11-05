import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Info, ShieldAlert, X, Copy, Check } from "lucide-react";

/**
 * Accessible Error Modal Dialog
 * Implements role="alertdialog", focus trap, ESC dismissal, scroll lock,
 * accessible color+icon pairings, and copyable technical details.
 */
export function ErrorModal({
  isOpen,
  onClose,
  error,
  title,
  message,
  severity = "danger", // info | warning | danger | critical
  primaryAction,
  secondaryAction,
  preventClose = false,
}) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  // Store last active element to restore focus on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      document.body.style.overflow = "hidden";
      // Focus first actionable button or dialog panel
      setTimeout(() => {
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current?.focus();
        }
      }, 50);
    } else {
      document.body.style.overflow = "";
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle ESC and Tab trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === "Escape" && !preventClose) {
        onClose?.();
        return;
      }

      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, preventClose, onClose]);

  if (!isOpen) return null;

  const displayTitle = title || error?.title || "An error occurred";
  const displayMessage = message || error?.message || "Something went wrong. Please try again.";
  const displayCode = error?.code || "UNKNOWN_ERROR";
  const displayRequestId = error?.requestId || null;

  const severityConfigs = {
    info: {
      Icon: Info,
      badgeText: "Information",
      badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      iconClass: "text-blue-500",
      buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
    },
    warning: {
      Icon: AlertTriangle,
      badgeText: "Notice",
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      iconClass: "text-amber-500",
      buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
    },
    danger: {
      Icon: AlertCircle,
      badgeText: "Action Required",
      badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
      iconClass: "text-red-500",
      buttonClass: "bg-red-600 hover:bg-red-700 text-white",
    },
    critical: {
      Icon: ShieldAlert,
      badgeText: "System Error",
      badgeClass: "bg-red-600/15 text-red-600 dark:text-red-400 border-red-600/30",
      iconClass: "text-red-600",
      buttonClass: "bg-red-600 hover:bg-red-700 text-white",
    },
  };

  const config = severityConfigs[severity] || severityConfigs.danger;
  const SeverityIcon = config.Icon;

  const copyTechnicalDetails = () => {
    const text = `Error Code: ${displayCode}\nRequest ID: ${displayRequestId || "N/A"}\nTime: ${new Date().toISOString()}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (!preventClose && e.target === e.currentTarget) {
          onClose?.();
        }
      }}
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-modal-title"
        aria-describedby="error-modal-description"
        tabIndex={-1}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 text-left outline-none animate-in zoom-in-95 duration-150 relative"
      >
        {!preventClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 mb-3">
          <div className={`p-2 rounded-xl border ${config.badgeClass}`}>
            <SeverityIcon className="w-5 h-5" />
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${config.badgeClass}`}>
            {config.badgeText}
          </span>
        </div>

        <h2
          id="error-modal-title"
          className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2"
        >
          {displayTitle}
        </h2>

        <div
          id="error-modal-description"
          className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-5"
        >
          {displayMessage}
        </div>

        {/* Technical Details Disclosure */}
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
          >
            {showTechnicalDetails ? "Hide technical details" : "Show technical details"}
          </button>

          {showTechnicalDetails && (
            <div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
              <div className="flex justify-between items-center mb-1">
                <span>Code: {displayCode}</span>
                <button
                  type="button"
                  onClick={copyTechnicalDetails}
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 rounded"
                >
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {displayRequestId && (
                <div className="text-zinc-500 break-all">Request ID: {displayRequestId}</div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          {secondaryAction && (
            <button
              type="button"
              onClick={() => {
                secondaryAction.onClick ? secondaryAction.onClick() : onClose?.();
              }}
              className="px-3.5 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
            >
              {secondaryAction.label || "Cancel"}
            </button>
          )}

          {primaryAction ? (
            <button
              type="button"
              onClick={() => {
                primaryAction.onClick ? primaryAction.onClick() : onClose?.();
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs ${config.buttonClass}`}
            >
              {primaryAction.label || "Dismiss"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
