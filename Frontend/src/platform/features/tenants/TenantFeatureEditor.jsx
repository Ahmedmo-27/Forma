import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Minus } from "lucide-react";
import {
  apiGetFeatures,
  apiGetPlans,
  apiGetPlanImpactPreview,
  apiUpdatePlan,
  apiUpdateTenantLifecycle,
} from "../../lib/api/endpoints";
import { Button, Input, Badge, Checkbox, Callout, Skeleton, Dialog, platformToast } from "../../ui";
import { usePermission } from "../../lib/auth/PermissionContext";
import { FEATURE_CATEGORIES } from "../plans/CreateFeatureModal";

function planKey(plan) {
  return String(plan?._id || plan?.id || "");
}

function sameMembers(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function featureLabel(features, key) {
  return features.find((feature) => feature.key === key)?.name || key;
}

export default function TenantFeatureEditor({ tenant, onSaved }) {
  const canManagePlans = usePermission("plans.manage");
  const canLifecycle = usePermission("tenants.lifecycle");

  const { data: plans = [], isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => apiGetPlans().then((response) => response.data),
  });

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ["platform", "features"],
    queryFn: () => apiGetFeatures().then((response) => response.data),
  });

  const planSignature = plans
    .map((plan) => `${planKey(plan)}:${[...(plan.features || [])].sort().join(",")}`)
    .join("|");
  const gymSignature = `${tenant.id || tenant._id}::${[...(tenant.featureOverrides?.add || [])].sort().join(",")}::${[
    ...(tenant.featureOverrides?.remove || []),
  ]
    .sort()
    .join(",")}`;

  const [draftFeatures, setDraftFeatures] = useState({});
  const [syncedPlanSignature, setSyncedPlanSignature] = useState("");
  const [addFeatures, setAddFeatures] = useState(() => [...(tenant.featureOverrides?.add || [])]);
  const [removeFeatures, setRemoveFeatures] = useState(() => [...(tenant.featureOverrides?.remove || [])]);
  const [syncedGymSignature, setSyncedGymSignature] = useState(gymSignature);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [savingPlans, setSavingPlans] = useState(false);
  const [savingGym, setSavingGym] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactRows, setImpactRows] = useState([]);

  if (planSignature !== syncedPlanSignature) {
    const next = {};
    for (const plan of plans) next[planKey(plan)] = [...(plan.features || [])];
    setDraftFeatures(next);
    setSyncedPlanSignature(planSignature);
  }

  if (gymSignature !== syncedGymSignature) {
    setAddFeatures([...(tenant.featureOverrides?.add || [])]);
    setRemoveFeatures([...(tenant.featureOverrides?.remove || [])]);
    setSyncedGymSignature(gymSignature);
    setReason("");
  }

  const currentPlanId = planKey(tenant.plan);
  const visiblePlans = useMemo(
    () =>
      plans.filter(
        (plan) => plan.visibility !== "archived" || planKey(plan) === currentPlanId
      ),
    [plans, currentPlanId]
  );

  const savedPlan = visiblePlans.find((plan) => planKey(plan) === currentPlanId) || tenant.plan;
  const savedPlanFeatures = new Set(savedPlan?.features || []);

  const dirtyPlans = visiblePlans.filter(
    (plan) => !sameMembers(draftFeatures[planKey(plan)] || [], plan.features || [])
  );
  const gymDirty =
    !sameMembers(addFeatures, tenant.featureOverrides?.add || []) ||
    !sameMembers(removeFeatures, tenant.featureOverrides?.remove || []);

  const filteredFeatures = useMemo(() => {
    const query = search.trim().toLowerCase();
    const categoryOrder = new Map(FEATURE_CATEGORIES.map((category, index) => [category.value, index]));
    return [...features]
      .filter((feature) => {
        if (!query) return true;
        return (
          feature.name.toLowerCase().includes(query) ||
          feature.key.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => {
        const leftOrder = categoryOrder.get(left.category) ?? 99;
        const rightOrder = categoryOrder.get(right.category) ?? 99;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.name.localeCompare(right.name);
      });
  }, [features, search]);

  const togglePlanFeature = (plan, featureKey) => {
    const id = planKey(plan);
    setDraftFeatures((current) => {
      const list = current[id] || [];
      const next = list.includes(featureKey)
        ? list.filter((key) => key !== featureKey)
        : [...list, featureKey];
      return { ...current, [id]: next };
    });
  };

  const toggleGymFeature = (featureKey) => {
    const inPlan = savedPlanFeatures.has(featureKey);
    const added = addFeatures.includes(featureKey);
    const removed = removeFeatures.includes(featureKey);

    if (added) {
      setAddFeatures((current) => current.filter((key) => key !== featureKey));
      return;
    }
    if (removed) {
      setRemoveFeatures((current) => current.filter((key) => key !== featureKey));
      return;
    }
    if (inPlan) {
      setRemoveFeatures((current) => [...current, featureKey]);
      return;
    }
    setAddFeatures((current) => [...current, featureKey]);
  };

  const discardPlanDrafts = () => {
    const next = {};
    for (const plan of plans) next[planKey(plan)] = [...(plan.features || [])];
    setDraftFeatures(next);
  };

  const openPlanImpact = async () => {
    setError(null);
    setSavingPlans(true);
    try {
      const rows = await Promise.all(
        dirtyPlans.map(async (plan) => {
          const targetFeatures = draftFeatures[planKey(plan)] || [];
          const response = await apiGetPlanImpactPreview(plan._id || plan.id, { targetFeatures });
          const saved = new Set(plan.features || []);
          return {
            plan,
            targetFeatures,
            impact: response.data,
            added: targetFeatures.filter((key) => !saved.has(key)),
            removed: (plan.features || []).filter((key) => !targetFeatures.includes(key)),
          };
        })
      );
      setImpactRows(rows);
      setImpactOpen(true);
    } catch (err) {
      setError(err?.message || "Could not preview which gyms these plan changes affect");
    } finally {
      setSavingPlans(false);
    }
  };

  const confirmPlanSave = async () => {
    setSavingPlans(true);
    setError(null);
    try {
      for (const row of impactRows) {
        await apiUpdatePlan(row.plan._id || row.plan.id, { features: row.targetFeatures });
      }
      platformToast.success(
        impactRows.length === 1
          ? `Features updated on ${impactRows[0].plan.name}`
          : `Features updated on ${impactRows.length} plans`
      );
      setImpactOpen(false);
      await refetchPlans();
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Failed to save plan features");
      await refetchPlans();
      onSaved?.();
    } finally {
      setSavingPlans(false);
    }
  };

  const saveGymFeatures = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError("Add a reason of at least 5 characters. It is stored on this gym's audit trail.");
      return;
    }

    setSavingGym(true);
    setError(null);
    try {
      await apiUpdateTenantLifecycle(tenant.id || tenant._id, {
        action: "change_overrides",
        reason: trimmedReason,
        featureOverrides: { add: addFeatures, remove: removeFeatures },
      });
      platformToast.success(`Features updated for ${tenant.name}`);
      setReason("");
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Failed to update this gym's features");
    } finally {
      setSavingGym(false);
    }
  };

  if (plansLoading || featuresLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Callout variant="info" className="text-xs">
        Check a feature to include it on that plan. Gyms on the plan receive it, unless that gym has turned the feature off.
        The column beside each feature adds or removes it for <strong>{tenant.name}</strong> only.
      </Callout>

      {error && <Callout variant="danger">{error}</Callout>}

      {!canManagePlans && (
        <Callout variant="neutral" className="text-xs">
          Plan columns are read-only for this account. Changing a plan requires the plans permission.
        </Callout>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search features by name or key"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full sm:max-w-sm text-xs"
          aria-label="Search features"
        />
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--platform-text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            On the plan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Added to this gym
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Removed from this gym
          </span>
        </div>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-auto max-h-[640px] rounded-xl border border-[var(--platform-border-subtle)] bg-[var(--platform-surface)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)]">
              <th className="sticky left-0 z-30 min-w-[240px] w-[240px] bg-[var(--platform-canvas)] px-4 py-3 font-semibold text-[var(--platform-text-primary)] shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                Feature
              </th>
              <th className="sticky left-[240px] z-30 min-w-[180px] border-l border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] px-3 py-3 text-center font-semibold text-[var(--platform-text-primary)] shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                <div className="flex flex-col items-center gap-1">
                  <span>{tenant.name}</span>
                  <Badge variant={gymDirty ? "warning" : "neutral"} size="xs">
                    {gymDirty ? "Unsaved gym changes" : "This gym only"}
                  </Badge>
                </div>
              </th>
              {visiblePlans.map((plan) => {
                const isCurrent = planKey(plan) === currentPlanId;
                const dirty = dirtyPlans.some((item) => planKey(item) === planKey(plan));
                return (
                  <th
                    key={planKey(plan)}
                    className={`min-w-[148px] border-l px-3 py-3 text-center font-semibold ${
                      isCurrent
                        ? "border-[var(--platform-accent)]/40 bg-[var(--platform-accent)]/10 text-[var(--platform-text-primary)]"
                        : "border-[var(--platform-border-subtle)] text-[var(--platform-text-primary)]"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{plan.name}</span>
                      {isCurrent && (
                        <Badge variant="accent" size="xs">
                          This gym
                        </Badge>
                      )}
                      {dirty && (
                        <span className="text-[10px] font-medium text-[var(--platform-warning)]">
                          Unsaved
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--platform-border-subtle)]">
            {filteredFeatures.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + visiblePlans.length}
                  className="px-4 py-8 text-center text-[var(--platform-text-muted)]"
                >
                  No features match that search.
                </td>
              </tr>
            ) : (
              filteredFeatures.map((feature) => {
                const inactive = feature.isActive === false;
                const inSavedPlan = savedPlanFeatures.has(feature.key);
                const added = addFeatures.includes(feature.key);
                const removed = removeFeatures.includes(feature.key);
                const effective = (inSavedPlan && !removed) || added;
                const currentDraft = (draftFeatures[currentPlanId] || []).includes(feature.key);
                const planDraftDiffers = Boolean(currentPlanId) && currentDraft !== inSavedPlan;

                let gymStatus = "Not on this gym";
                let gymAction = "Add to this gym";
                if (added) {
                  gymStatus = "Added for this gym";
                  gymAction = "Remove add";
                } else if (removed) {
                  gymStatus = "Turned off for this gym";
                  gymAction = "Restore";
                } else if (inSavedPlan) {
                  gymStatus = "Included by plan";
                  gymAction = "Turn off for this gym";
                }

                const gymLocked = !canLifecycle || (inactive && !effective);

                return (
                  <tr key={feature.key} className="hover:bg-[var(--platform-surface-subtle)]/60">
                    <td className="sticky left-0 z-10 w-[240px] min-w-[240px] bg-[var(--platform-surface)] px-4 py-3 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                      <div className="font-medium text-[var(--platform-text-primary)]">{feature.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-[var(--platform-text-muted)]">
                        {feature.key}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="neutral" size="xs" className="capitalize">
                          {feature.category || "core"}
                        </Badge>
                        {inactive && (
                          <Badge variant="warning" size="xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="sticky left-[240px] z-10 border-l border-[var(--platform-border-subtle)] bg-[var(--platform-surface)] px-3 py-3 shadow-[1px_0_0_0_var(--platform-border-subtle)]">
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            added
                              ? "text-blue-600 dark:text-blue-300"
                              : removed
                                ? "text-red-600 dark:text-red-300"
                                : effective
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-[var(--platform-text-muted)]"
                          }`}
                        >
                          {added ? (
                            <Plus className="h-3 w-3" />
                          ) : removed ? (
                            <Minus className="h-3 w-3" />
                          ) : effective ? (
                            <Check className="h-3 w-3" />
                          ) : null}
                          {gymStatus}
                        </span>
                        {planDraftDiffers && (
                          <span className="text-[10px] text-[var(--platform-warning)]">
                            Plan checkbox is unsaved
                          </span>
                        )}
                        <Button
                          type="button"
                          size="xs"
                          variant={effective ? "outline" : "primary"}
                          disabled={gymLocked}
                          onClick={() => toggleGymFeature(feature.key)}
                        >
                          {gymAction}
                        </Button>
                      </div>
                    </td>
                    {visiblePlans.map((plan) => {
                      const id = planKey(plan);
                      const savedOn = (plan.features || []).includes(feature.key);
                      const draftOn = (draftFeatures[id] || []).includes(feature.key);
                      const isCurrent = id === currentPlanId;
                      return (
                        <td
                          key={id}
                          className={`border-l px-3 py-3 text-center ${
                            isCurrent
                              ? "border-[var(--platform-accent)]/30 bg-[var(--platform-accent)]/5"
                              : "border-[var(--platform-border-subtle)]"
                          } ${draftOn !== savedOn ? "ring-1 ring-inset ring-[var(--platform-warning)]/50" : ""}`}
                        >
                          <div className="flex justify-center">
                            <Checkbox
                              checked={draftOn}
                              disabled={!canManagePlans || (inactive && !draftOn)}
                              onChange={() => togglePlanFeature(plan, feature.key)}
                              aria-label={`${draftOn ? "Remove" : "Include"} ${feature.name} on ${plan.name}`}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(dirtyPlans.length > 0 || gymDirty) && (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
          {dirtyPlans.length > 0 && canManagePlans && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[var(--platform-text-secondary)]">
                {dirtyPlans.length === 1
                  ? `${dirtyPlans[0].name} has unsaved feature changes. Saving updates every gym on that plan.`
                  : `${dirtyPlans.length} plans have unsaved feature changes. Saving updates every gym on those plans.`}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={discardPlanDrafts} disabled={savingPlans}>
                  Discard plan edits
                </Button>
                <Button type="button" size="sm" variant="primary" loading={savingPlans} onClick={openPlanImpact}>
                  Review plan changes
                </Button>
              </div>
            </div>
          )}

          {gymDirty && canLifecycle && (
            <div
              className={`flex flex-col gap-2 sm:flex-row sm:items-end ${
                dirtyPlans.length > 0 && canManagePlans
                  ? "border-t border-[var(--platform-border-subtle)] pt-3"
                  : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="gym-feature-reason"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]"
                >
                  Reason for this gym
                </label>
                <Input
                  id="gym-feature-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why this gym gets a feature its plan does not include"
                  className="text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={savingGym}
                  onClick={() => {
                    setAddFeatures([...(tenant.featureOverrides?.add || [])]);
                    setRemoveFeatures([...(tenant.featureOverrides?.remove || [])]);
                    setReason("");
                    setError(null);
                  }}
                >
                  Discard gym edits
                </Button>
                <Button type="button" size="sm" variant="primary" loading={savingGym} onClick={saveGymFeatures}>
                  Save this gym
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog
        isOpen={impactOpen}
        onClose={() => !savingPlans && setImpactOpen(false)}
        title="Save plan features"
        description="These changes apply to every gym on the edited plan, except gyms that already turned a feature off."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={() => setImpactOpen(false)} disabled={savingPlans}>
              Back
            </Button>
            <Button type="button" variant="primary" loading={savingPlans} onClick={confirmPlanSave}>
              Save plan features
            </Button>
          </div>
        }
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {impactRows.map((row) => {
            const affected = row.impact?.impact?.totalAffectedTenants ?? 0;
            const protectedCount = row.impact?.impact?.lifetimeSnapshotProtected ?? 0;
            return (
              <div
                key={planKey(row.plan)}
                className="space-y-2 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--platform-text-primary)]">{row.plan.name}</span>
                  <Badge variant="neutral" size="xs">
                    {affected} gym{affected === 1 ? "" : "s"} follow this plan
                  </Badge>
                </div>
                {row.added.length > 0 && (
                  <p className="text-xs text-[var(--platform-text-secondary)]">
                    Add: {row.added.map((key) => featureLabel(features, key)).join(", ")}
                  </p>
                )}
                {row.removed.length > 0 && (
                  <p className="text-xs text-[var(--platform-text-secondary)]">
                    Remove: {row.removed.map((key) => featureLabel(features, key)).join(", ")}
                  </p>
                )}
                {protectedCount > 0 && (
                  <p className="text-[11px] text-[var(--platform-text-muted)]">
                    {protectedCount} lifetime gym{protectedCount === 1 ? "" : "s"} keep a frozen feature snapshot and will not pick up this plan edit.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
