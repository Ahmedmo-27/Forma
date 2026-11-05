import { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { Input } from "../ui/Input";

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm, // async ({ reason, typedSlug }) => void
  title = "Confirm Operation",
  description,
  impactSummary,
  confirmLabel = "Confirm Action",
  variant = "danger", // "danger" | "warning" | "primary"
  requireReason = true,
  reasonPlaceholder = "Provide the audit justification for this governance action...",
  typedSlugMatch = null, // e.g. "titan-fitness" (if purge requires exact slug)
  loading = false,
}) {
  const [reason, setReason] = useState("");
  const [typedSlug, setTypedSlug] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setTypedSlug("");
      setError("");
    }
  }, [isOpen]);

  const isSlugValid = !typedSlugMatch || typedSlug.trim().toLowerCase() === typedSlugMatch.toLowerCase();
  const isReasonValid = !requireReason || reason.trim().length >= 3;
  const canSubmit = isSlugValid && isReasonValid;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isSlugValid) {
      setError(`Please type the exact slug '${typedSlugMatch}' to proceed.`);
      return;
    }
    if (!isReasonValid) {
      setError("A specific audit reason is strictly required.");
      return;
    }
    setError("");
    onConfirm?.({ reason: reason.trim(), typedSlug: typedSlug.trim() });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button variant="ghost" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            loading={loading}
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        {/* Impact Summary Card */}
        {impactSummary && (
          <div className="p-3 rounded-[var(--platform-radius-md)] bg-[var(--platform-danger-subtle)] border border-[var(--platform-danger)]/30 text-[var(--platform-danger)] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">{impactSummary}</div>
          </div>
        )}

        {/* Typed Slug Confirmation (for permanent purge) */}
        {typedSlugMatch && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--platform-text-secondary)]">
              To verify, type{" "}
              <span className="platform-mono font-bold text-[var(--platform-danger)] bg-[var(--platform-danger-subtle)] px-1.5 py-0.5 rounded border border-[var(--platform-danger)]/20">
                {typedSlugMatch}
              </span>{" "}
              below:
            </label>
            <Input
              value={typedSlug}
              onChange={(e) => {
                setTypedSlug(e.target.value);
                if (error) setError("");
              }}
              placeholder={typedSlugMatch}
              isMono
              required
            />
          </div>
        )}

        {/* Mandatory Reason Field */}
        {requireReason && (
          <Textarea
            label="Mandatory Audit Reason"
            required
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError("");
            }}
            maxLength={300}
            rows={2}
          />
        )}

        {error && (
          <p className="text-xs text-[var(--platform-danger)] font-medium">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
