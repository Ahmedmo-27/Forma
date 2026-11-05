import { useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Checkbox,
  Callout,
  platformToast,
} from "../../ui";
import { apiProcessRefund, apiGetTenants } from "../../lib/api/endpoints";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, AlertCircle } from "lucide-react";

export default function ProcessRefundModal({
  open,
  onOpenChange,
  defaultTenantId = "",
  onRefunded,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tenantId, setTenantId] = useState(defaultTenantId || "");
  const [amount, setAmount] = useState(49);
  const [revokeLifetime, setRevokeLifetime] = useState(false);
  const [reason, setReason] = useState("");

  const { data: tenantsData } = useQuery({
    queryKey: ["platform", "tenants-select"],
    queryFn: () => apiGetTenants({ limit: 100 }).then((r) => r.data?.tenants || []),
    enabled: open,
  });

  const tenants = tenantsData || [];
  const selectedTenant = tenants.find((t) => t._id === tenantId);
  const isLifetimeSubscriber = selectedTenant?.billing?.cycle === "lifetime";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tenantId) {
      setError("Please select a target gym subscriber");
      return;
    }
    if (amount === "" || Number(amount) <= 0) {
      setError("Please provide a valid refund amount");
      return;
    }
    if (!reason || reason.trim().length < 5) {
      setError("A documented audit reason (at least 5 chars) is mandatory");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiProcessRefund({
        tenantId,
        amount: Number(amount),
        revokeLifetimeIfApplicable: revokeLifetime,
        reason: reason.trim(),
      });

      platformToast.success("Financial refund processed successfully");
      onRefunded?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to process refund");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2.5">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="danger"
        loading={loading}
        onClick={handleSubmit}
      >
        Execute Settlement Refund
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Process Commercial Refund"
      description="Appends a debit refund entry to the ledger and adjusts subscriber status."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout variant="danger">{error}</Callout>}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Target Gym Tenant <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            required
          >
            <option value="">Select gym subscriber...</option>
            {tenants.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.slug}) - {t.billing?.cycle || "monthly"}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Settlement Refund Amount ($) <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        {isLifetimeSubscriber && (
          <div className="p-3 rounded-lg border border-[var(--platform-danger-border)] bg-[var(--platform-danger-surface)] space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={revokeLifetime}
                onCheckedChange={setRevokeLifetime}
                className="mt-0.5"
              />
              <div className="text-xs">
                <span className="font-semibold text-[var(--platform-danger)]">
                  Revoke Lifetime Entitlement Pass
                </span>
                <p className="text-[11px] text-[var(--platform-text-muted)] mt-0.5">
                  Tenant will immediately lose perpetual access and revert to suspended status.
                </p>
              </div>
            </label>
          </div>
        )}

        <div className="p-3 rounded-lg border border-[var(--platform-warning-border)] bg-[var(--platform-warning-surface)] space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--platform-warning)]">
            Mandatory Operator Reason *
          </label>
          <Input
            placeholder="e.g. Pro-rated cancellation requested ref Ticket #449"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-[var(--platform-surface)]"
            required
          />
          <span className="text-[10px] text-[var(--platform-text-muted)] block">
            Etched into immutable platform audit trail and invoice notes.
          </span>
        </div>
      </form>
    </Dialog>
  );
}
