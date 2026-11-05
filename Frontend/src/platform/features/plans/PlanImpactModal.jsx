import { useState, useEffect } from "react";
import {
  Dialog,
  Button,
  Callout,
  Badge,
  Skeleton,
} from "../../ui";
import { apiGetPlanImpactPreview } from "../../lib/api/endpoints";
import { ShieldCheck, AlertTriangle, PlusCircle, MinusCircle, Users } from "lucide-react";

export default function PlanImpactModal({ open, onOpenChange, plan, targetFeatures, onConfirmSave, saving }) {
  const [loading, setLoading] = useState(false);
  const [impactData, setImpactData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && plan?._id) {
      setLoading(true);
      setError(null);
      apiGetPlanImpactPreview(plan._id, { targetFeatures: targetFeatures || [] })
        .then((res) => {
          setImpactData(res.data);
        })
        .catch((err) => {
          setError(err?.message || "Failed to calculate tenant impact preview");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, plan, targetFeatures]);

  const footer = (
    <div className="flex items-center justify-end gap-2.5">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="primary"
        loading={saving}
        onClick={onConfirmSave}
      >
        Confirm & Save Plan
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Subscriber Impact Preview"
      description={`Simulated subscriber changes for plan ${plan?.name || ""} (${plan?.key || ""}).`}
      footer={footer}
      size="lg"
    >
      <div className="space-y-6">
        {error && <Callout variant="danger">{error}</Callout>}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : impactData ? (
          <>
            {/* Telemetry Impact Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
                <div className="flex items-center gap-2 text-xs text-[var(--platform-text-muted)] mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>Total Subscribers</span>
                </div>
                <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
                  {impactData.totalSubscribers || 0}
                </div>
                <span className="text-[11px] text-[var(--platform-text-muted)]">Active or trial tenants</span>
              </div>

              <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
                <div className="flex items-center gap-2 text-xs text-[var(--platform-text-muted)] mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--platform-warning)]" />
                  <span>Affected by Mutation</span>
                </div>
                <div className="text-2xl font-bold font-mono text-[var(--platform-warning)]">
                  {impactData.impact?.totalAffectedTenants || 0}
                </div>
                <span className="text-[11px] text-[var(--platform-text-muted)]">
                  {impactData.impact?.recurringSubscribersAffected || 0} recurring + {impactData.impact?.lifetimeFollowTierAffected || 0} follow-tier
                </span>
              </div>

              <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
                <div className="flex items-center gap-2 text-xs text-[var(--platform-text-muted)] mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--platform-success)]" />
                  <span>Snapshot Protected</span>
                </div>
                <div className="text-2xl font-bold font-mono text-[var(--platform-success)]">
                  {impactData.impact?.lifetimeSnapshotProtected || 0}
                </div>
                <span className="text-[11px] text-[var(--platform-text-muted)]">Lifetime grandfathered</span>
              </div>
            </div>

            {/* Feature Diff Visualizer */}
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] p-4 space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                Entitlement Delta Preview
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Features Added */}
                <div className="p-3 rounded-md bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--platform-success)] mb-2">
                    <PlusCircle className="w-4 h-4" />
                    <span>Granting ({impactData.featuresAdded?.length || 0})</span>
                  </div>
                  {impactData.featuresAdded?.length === 0 ? (
                    <span className="text-xs text-[var(--platform-text-muted)] italic">No features added</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {impactData.featuresAdded.map((f) => (
                        <Badge key={f} variant="success" size="sm" className="font-mono">
                          +{f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Features Removed */}
                <div className="p-3 rounded-md bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--platform-danger)] mb-2">
                    <MinusCircle className="w-4 h-4" />
                    <span>Revoking ({impactData.featuresRemoved?.length || 0})</span>
                  </div>
                  {impactData.featuresRemoved?.length === 0 ? (
                    <span className="text-xs text-[var(--platform-text-muted)] italic">No features revoked</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {impactData.featuresRemoved.map((f) => (
                        <Badge key={f} variant="danger" size="sm" className="font-mono">
                          -{f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {impactData.featuresRemoved?.length > 0 && (
                <Callout variant="warning">
                  Removing active features affects {impactData.impact?.totalAffectedTenants || 0} live subscribers immediately.
                  Ensure downstream tenant workflows will not fail.
                </Callout>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
