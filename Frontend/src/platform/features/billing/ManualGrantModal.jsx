import { useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Callout,
  platformToast,
} from "../../ui";
import { apiIssueManualGrant, apiGetTenants, apiGetPlans } from "../../lib/api/endpoints";
import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";

export default function ManualGrantModal({ open, onOpenChange, onGranted }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tenantId, setTenantId] = useState("");
  const [planKey, setPlanKey] = useState("pro");
  const [cycle, setCycle] = useState("monthly");
  const [durationMonths, setDurationMonths] = useState(1);
  const [reason, setReason] = useState("");

  const { data: tenantsData } = useQuery({
    queryKey: ["platform", "tenants-select"],
    queryFn: () => apiGetTenants({ limit: 100 }).then((r) => r.data?.tenants || []),
    enabled: open,
  });

  const { data: plansData } = useQuery({
    queryKey: ["platform", "plans-select"],
    queryFn: () => apiGetPlans().then((r) => r.data || []),
    enabled: open,
  });

  const tenants = tenantsData || [];
  const plans = plansData || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tenantId) {
      setError("Please select a target gym subscriber");
      return;
    }
    if (!planKey) {
      setError("Please select a target plan");
      return;
    }
    if (!reason || reason.trim().length < 5) {
      setError("A documented audit reason (at least 5 chars) is mandatory");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiIssueManualGrant({
        tenantId,
        planKey,
        cycle,
        durationMonths: cycle === "lifetime" ? null : Number(durationMonths),
        reason: reason.trim(),
      });

      platformToast.success("Complimentary subscription grant activated");
      onGranted?.();
      onOpenChange(false);
    } catch (err) {
      setError(err.normalized?.message || err.response?.data?.error?.message || err?.message || "Failed to issue manual grant");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2.5">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="button" variant="primary" loading={loading} onClick={handleSubmit}>
        Grant Access
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Issue Manual Complimentary Grant"
      description="Bestow subscription access to a gym without requiring commercial payment processing."
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
                {t.name} ({t.slug})
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Target Plan <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Select
              value={planKey}
              onChange={(e) => setPlanKey(e.target.value)}
              required
            >
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Billing Cadence
            </label>
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              <option value="monthly">Monthly Recurring</option>
              <option value="yearly">Yearly Contract</option>
              <option value="lifetime">Lifetime Pass (Perpetual)</option>
            </Select>
          </div>
        </div>

        {cycle !== "lifetime" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Grant Duration (Months)
            </label>
            <Input
              type="number"
              min="1"
              max="60"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              required
            />
          </div>
        )}

        <div className="p-3 rounded-lg border border-[var(--platform-warning-border)] bg-[var(--platform-warning-surface)] space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--platform-warning)]">
            Mandatory Operator Reason *
          </label>
          <Input
            placeholder="e.g. Executive courtesy extension ref VIP Partner #109"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-[var(--platform-surface)]"
            required
          />
          <span className="text-[10px] text-[var(--platform-text-muted)] block">
            This reason will be etched into the immutable ledger and audit trail.
          </span>
        </div>
      </form>
    </Dialog>
  );
}
