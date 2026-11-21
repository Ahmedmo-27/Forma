import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import {
  apiGetFeatures,
  apiGetFeatureTrials,
  apiGrantTenantFeatureTrial,
  apiUpdateTenantLifecycle,
} from "../../lib/api/endpoints";
import { Button, Input, Badge, Switch, Skeleton, Dialog, platformToast } from "../../ui";
import { usePermission } from "../../lib/auth/PermissionContext";
import { formatDate } from "../../lib/utils/formatters";
import { FEATURE_CATEGORIES } from "../plans/CreateFeatureModal";

function tenantIdOf(tenant) {
  return String(tenant?.id || tenant?._id || "");
}

export default function TenantOutOfPlanPanel({ tenant, onSaved }) {
  const canLifecycle = usePermission("tenants.lifecycle");
  const canTrials = usePermission("tenants.feature_trials");
  const id = tenantIdOf(tenant);

  const effectiveSet = useMemo(
    () => new Set(Array.isArray(tenant?.effectiveFeatures) ? tenant.effectiveFeatures : []),
    [tenant?.effectiveFeatures]
  );

  const showOutOfPlan = useMemo(
    () =>
      Array.isArray(tenant?.featureVisibility?.showOutOfPlan)
        ? tenant.featureVisibility.showOutOfPlan
        : [],
    [tenant?.featureVisibility?.showOutOfPlan]
  );

  const activeTrialsByKey = useMemo(() => {
    const map = new Map();
    for (const trial of tenant?.featureTrials || []) {
      if (trial?.featureKey) map.set(trial.featureKey, trial);
    }
    return map;
  }, [tenant?.featureTrials]);

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ["platform", "features"],
    queryFn: () => apiGetFeatures().then((response) => response.data),
  });

  const { data: pendingRows = [], refetch: refetchPending } = useQuery({
    queryKey: ["platform", "feature-trials", "pending", id],
    queryFn: () =>
      apiGetFeatureTrials({ status: "pending", tenantId: id, limit: 100 }).then(
        (response) => response.data?.requests || []
      ),
    enabled: Boolean(id) && canTrials,
  });

  const pendingByKey = useMemo(() => {
    const map = new Map();
    for (const row of pendingRows) {
      if (row?.featureKey) map.set(row.featureKey, row);
    }
    return map;
  }, [pendingRows]);

  const outOfPlan = useMemo(() => {
    const categoryOrder = new Map(FEATURE_CATEGORIES.map((c, i) => [c.value, i]));
    return [...features]
      .filter((feature) => feature?.key && !effectiveSet.has(feature.key))
      .sort((left, right) => {
        const leftOrder = categoryOrder.get(left.category) ?? 99;
        const rightOrder = categoryOrder.get(right.category) ?? 99;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return (left.name || left.key).localeCompare(right.name || right.key);
      });
  }, [features, effectiveSet]);

  const [savingKey, setSavingKey] = useState(null);
  const [trialTarget, setTrialTarget] = useState(null);
  const [durationValue, setDurationValue] = useState(14);
  const [durationUnit, setDurationUnit] = useState("days");
  const [note, setNote] = useState("");
  const [granting, setGranting] = useState(false);

  const toggleVisible = async (featureKey, nextVisible) => {
    if (!canLifecycle) return;
    const current = new Set(showOutOfPlan);
    if (nextVisible) current.add(featureKey);
    else current.delete(featureKey);
    const nextList = [...current];

    setSavingKey(featureKey);
    try {
      await apiUpdateTenantLifecycle(id, {
        action: "change_feature_visibility",
        reason: nextVisible
          ? `Show out-of-plan feature ${featureKey} in gym nav`
          : `Hide out-of-plan feature ${featureKey} from gym nav`,
        featureVisibility: { showOutOfPlan: nextList },
      });
      platformToast.success(
        nextVisible ? `${featureKey} visible as locked preview` : `${featureKey} hidden from gym nav`
      );
      onSaved?.();
    } catch (err) {
      platformToast.error(
        err.normalized?.message || err.response?.data?.message || err?.message || "Could not update visibility"
      );
    } finally {
      setSavingKey(null);
    }
  };

  const openTrial = (feature) => {
    setTrialTarget(feature);
    setDurationValue(14);
    setDurationUnit("days");
    setNote("");
  };

  const submitTrial = async () => {
    if (!trialTarget || !canTrials) return;
    setGranting(true);
    try {
      await apiGrantTenantFeatureTrial(id, {
        featureKey: trialTarget.key,
        durationValue: Number(durationValue),
        durationUnit,
        note: note.trim() || undefined,
      });
      platformToast.success(`Trial started for ${trialTarget.name || trialTarget.key}`);
      setTrialTarget(null);
      onSaved?.();
      refetchPending();
    } catch (err) {
      platformToast.error(
        err.normalized?.message || err.response?.data?.message || err?.message || "Could not start trial"
      );
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-[var(--platform-border-subtle)]">
        <div>
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Out of plan
          </h3>
          <p className="text-[11px] text-[var(--platform-text-muted)] mt-0.5 max-w-xl">
            Features not included in this gym&apos;s plan stay hidden by default. Toggle visibility to show them as
            locked previews in the gym nav, or start a timed trial.
          </p>
        </div>
        <Badge variant="neutral" size="xs">
          {outOfPlan.length} outside plan
        </Badge>
      </div>

      {featuresLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : outOfPlan.length === 0 ? (
        <p className="text-xs text-[var(--platform-text-muted)]">
          This gym already has every catalog feature enabled.
        </p>
      ) : (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {outOfPlan.map((feature) => {
            const visible = showOutOfPlan.includes(feature.key);
            const trial = activeTrialsByKey.get(feature.key);
            const pending = pendingByKey.get(feature.key);
            const busy = savingKey === feature.key;

            return (
              <div
                key={feature.key}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-[var(--platform-radius-md)] border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-subtle)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--platform-text-primary)] truncate">
                      {feature.name || feature.key}
                    </span>
                    <span className="platform-mono text-[10px] text-[var(--platform-text-muted)]">
                      {feature.key}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {trial ? (
                      <Badge variant="warning" size="xs">
                        Trial ends {formatDate(trial.endsAt)}
                      </Badge>
                    ) : pending ? (
                      <Badge variant="accent" size="xs">
                        Pending request
                      </Badge>
                    ) : visible ? (
                      <Badge variant="neutral" size="xs" className="inline-flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        Visible locked
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="xs" className="inline-flex items-center gap-1 opacity-70">
                        <EyeOff className="w-3 h-3" />
                        Hidden
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {canLifecycle && (
                    <Switch
                      label="Show in gym"
                      description="Locked nav preview"
                      checked={visible}
                      disabled={busy}
                      onChange={(next) => toggleVisible(feature.key, next)}
                    />
                  )}
                  {canTrials && !trial && (
                    <Button size="xs" variant="outline" onClick={() => openTrial(feature)}>
                      Start trial
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        isOpen={Boolean(trialTarget)}
        onClose={() => !granting && setTrialTarget(null)}
        title={trialTarget ? `Start trial: ${trialTarget.name || trialTarget.key}` : "Start trial"}
        description="Grants a timed feature trial for this gym. The module unlocks immediately until the end date."
        size="md"
        footer={
          <>
            <Button variant="ghost" disabled={granting} onClick={() => setTrialTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={granting} onClick={submitTrial}>
              Start trial
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1">
                Duration
              </label>
              <Input
                type="number"
                min={1}
                max={durationUnit === "weeks" ? 12 : 90}
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
              />
            </div>
            <div className="w-28">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1">
                Unit
              </label>
              <select
                className="w-full h-9 rounded-md border border-[var(--platform-border)] bg-[var(--platform-surface)] px-2 text-sm"
                value={durationUnit}
                onChange={(e) => setDurationUnit(e.target.value)}
              >
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1">
              Note (optional)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this trial was started"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
