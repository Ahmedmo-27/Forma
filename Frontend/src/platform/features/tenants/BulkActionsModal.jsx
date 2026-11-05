import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { Textarea } from "../../ui/Textarea";
import { Callout } from "../../ui/Callout";
import { apiBulkTenantActions } from "../../lib/api/endpoints";
import { platformToast } from "../../ui/Toast";

export function BulkActionsModal({ isOpen, onClose, selectedIds = [], onSuccess }) {
  const [action, setAction] = useState("extend_trial");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [error, setError] = useState("");

  // Load preview whenever modal opens or action changes
  useEffect(() => {
    if (!isOpen || !selectedIds.length) {
      setPreview(null);
      setError("");
      setReason("");
      return;
    }

    setLoadingPreview(true);
    setError("");

    apiBulkTenantActions({
      action,
      tenantIds: selectedIds,
      previewOnly: true,
      payload: action === "extend_trial" ? { days: 7 } : {},
    })
      .then((res) => {
        setPreview(res.data);
      })
      .catch((err) => {
        setError(err.message || "Failed to preview bulk action");
      })
      .finally(() => {
        setLoadingPreview(false);
      });
  }, [isOpen, action, selectedIds]);

  const handleExecute = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("A specific audit reason is strictly mandatory for bulk mutations.");
      return;
    }

    setLoadingExecute(true);
    setError("");

    try {
      const res = await apiBulkTenantActions({
        action,
        tenantIds: selectedIds,
        previewOnly: false,
        reason: reason.trim(),
        payload: action === "extend_trial" ? { days: 7 } : {},
      });

      platformToast.success(res.data.message || `Bulk ${action} executed successfully!`);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Bulk action execution failed");
    } finally {
      setLoadingExecute(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Execute Bulk Tenant Mutation"
      description={`Apply a lifecycle action across ${selectedIds.length} selected subscriber gyms.`}
      size="md"
      footer={
        <>
          <Button variant="ghost" disabled={loadingExecute} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === "suspend" ? "danger" : "primary"}
            loading={loadingExecute}
            disabled={!reason.trim() || loadingPreview}
            onClick={handleExecute}
          >
            Execute on {selectedIds.length} Gyms
          </Button>
        </>
      }
    >
      <form onSubmit={handleExecute} className="space-y-4 text-left">
        {error && (
          <Callout variant="danger" onDismiss={() => setError("")}>
            {error}
          </Callout>
        )}

        <Select
          label="Bulk Lifecycle Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          options={[
            { value: "extend_trial", label: "Extend Trial (+7 Days)" },
            { value: "suspend", label: "Suspend Accounts" },
          ]}
        />

        {/* Dry-run preview summary */}
        {preview && (
          <div className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-[var(--platform-text-primary)]">
              <span>Dry-Run Impact Preview</span>
              <span className="platform-mono text-[var(--platform-accent)]">
                {preview.tenantCount} tenants targeted
              </span>
            </div>

            {preview.sampleTenants && preview.sampleTenants.length > 0 && (
              <div className="text-[11px] text-[var(--platform-text-muted)] space-y-1 pt-1 border-t border-[var(--platform-border-subtle)]">
                <span>Sample impacted gyms:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {preview.sampleTenants.map((t) => (
                    <span
                      key={t.id}
                      className="px-1.5 py-0.5 rounded bg-[var(--platform-surface)] border border-[var(--platform-border-subtle)]"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Textarea
          label="Mandatory Audit Reason"
          required
          rows={2}
          placeholder="Justify this bulk operation for platform audit logs..."
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError("");
          }}
        />
      </form>
    </Dialog>
  );
}
