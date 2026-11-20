import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGetPlans, apiUpdateTenantLifecycle } from "../../lib/api/endpoints";
import { Button, Input, Select, Badge, Callout, platformToast } from "../../ui";
import { usePermission } from "../../lib/auth/PermissionContext";

const CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const POLICIES = [
  { value: "follow_tier", label: "Follow the plan (new plan features reach this gym)" },
  { value: "snapshot", label: "Frozen snapshot (this gym keeps today's features)" },
];

function idOf(plan) {
  return String(plan?._id || plan?.id || "");
}

/**
 * Plan, billing cycle, and lifetime entitlement policy for one gym.
 * Each change goes through the lifecycle endpoint so it lands on the audit trail.
 */
export default function TenantSubscriptionPanel({ tenant, onSaved }) {
  const canLifecycle = usePermission("tenants.lifecycle");
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => apiGetPlans().then((response) => response.data),
  });

  const currentPlanId = idOf(tenant.plan);
  const cycle = tenant.billing?.cycle || "monthly";
  const isLifetime = cycle === "lifetime";
  const savedPolicy = tenant.billing?.lifetime?.entitlementPolicy || "follow_tier";

  const [planId, setPlanId] = useState(currentPlanId);
  const [newCycle, setNewCycle] = useState(isLifetime ? "monthly" : cycle);
  const [policy, setPolicy] = useState(savedPolicy);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [overLimit, setOverLimit] = useState(null);

  const selectablePlans = plans.filter(
    (plan) => plan.visibility !== "archived" || idOf(plan) === currentPlanId
  );

  const planDirty = planId !== currentPlanId;
  const cycleDirty = !isLifetime && newCycle !== cycle;
  const policyDirty = isLifetime && policy !== savedPolicy;

  const run = async (action, payload, successMessage) => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("Add a reason of at least 5 characters. It is stored on this gym's audit trail.");
      return;
    }
    setSaving(action);
    setError(null);
    try {
      await apiUpdateTenantLifecycle(tenant.id || tenant._id, { action, reason: trimmed, ...payload });
      platformToast.success(successMessage);
      setOverLimit(null);
      setReason("");
      onSaved?.();
    } catch (err) {
      if (err?.code === "PLAN_DOWNGRADE_OVER_LIMIT") {
        setOverLimit({ action, payload, message: err.message });
      } else {
        setError(err?.message || "Could not save this change");
      }
    } finally {
      setSaving(null);
    }
  };

  const savePlan = (force = false) =>
    run("change_plan", { newPlanId: planId, ...(force ? { force: true } : {}) }, `Plan changed for ${tenant.name}`);

  if (isLoading) return null;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface)] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Plan and billing</h3>
        <p className="mt-0.5 text-xs text-[var(--platform-text-muted)]">
          Changing the plan changes the features, roles, and limits this gym receives. Per-gym overrides below still apply.
        </p>
      </div>

      {error && <Callout variant="danger" className="text-xs">{error}</Callout>}
      {overLimit && (
        <Callout variant="warning" className="text-xs">
          <div className="space-y-2">
            <p>{overLimit.message}</p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              loading={saving === overLimit.action}
              onClick={() => savePlan(true)}
            >
              Apply anyway
            </Button>
          </div>
        </Callout>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]" htmlFor="tenant-plan">
            Plan
          </label>
          <Select id="tenant-plan" value={planId} onChange={(event) => setPlanId(event.target.value)} disabled={!canLifecycle}>
            {selectablePlans.map((plan) => (
              <option key={idOf(plan)} value={idOf(plan)}>
                {plan.name} ({plan.key})
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="xs"
            variant="primary"
            disabled={!canLifecycle || !planDirty}
            loading={saving === "change_plan"}
            onClick={() => savePlan(false)}
          >
            Change plan
          </Button>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]" htmlFor="tenant-cycle">
            Billing cycle
          </label>
          {isLifetime ? (
            <div>
              <Badge variant="success" size="sm">Lifetime license</Badge>
            </div>
          ) : (
            <>
              <Select id="tenant-cycle" value={newCycle} onChange={(event) => setNewCycle(event.target.value)} disabled={!canLifecycle}>
                {CYCLES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
              <Button
                type="button"
                size="xs"
                variant="primary"
                disabled={!canLifecycle || !cycleDirty}
                loading={saving === "change_cycle"}
                onClick={() => run("change_cycle", { newCycle }, `Billing cycle changed for ${tenant.name}`)}
              >
                Change cycle
              </Button>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]" htmlFor="tenant-policy">
            Lifetime entitlements
          </label>
          {isLifetime ? (
            <>
              <Select id="tenant-policy" value={policy} onChange={(event) => setPolicy(event.target.value)} disabled={!canLifecycle}>
                {POLICIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
              <Button
                type="button"
                size="xs"
                variant="primary"
                disabled={!canLifecycle || !policyDirty}
                loading={saving === "change_entitlement_policy"}
                onClick={() =>
                  run("change_entitlement_policy", { entitlementPolicy: policy }, `Entitlement policy changed for ${tenant.name}`)
                }
              >
                Change policy
              </Button>
            </>
          ) : (
            <p className="text-xs text-[var(--platform-text-muted)]">Only applies to lifetime gyms.</p>
          )}
        </div>
      </div>

      {canLifecycle && (planDirty || cycleDirty || policyDirty) && (
        <div className="max-w-xl">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]" htmlFor="tenant-subscription-reason">
            Reason
          </label>
          <Input
            id="tenant-subscription-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this change is being made"
            className="text-xs"
          />
        </div>
      )}

      {!canLifecycle && (
        <Callout variant="neutral" className="text-xs">
          Changing a gym's plan requires the tenants lifecycle permission.
        </Callout>
      )}
    </div>
  );
}
