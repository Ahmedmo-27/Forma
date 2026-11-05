import { useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Checkbox,
  Callout,
  Badge,
  platformToast,
} from "../../ui";
import { apiCreatePlan, apiUpdatePlan } from "../../lib/api/endpoints";
import PlanImpactModal from "./PlanImpactModal";

export default function CreatePlanModal({
  open,
  onOpenChange,
  planToEdit = null,
  availableFeatures = [],
  onSaved,
}) {
  const isEdit = Boolean(planToEdit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);

  // Form State
  const [key, setKey] = useState(planToEdit?.key || "");
  const [name, setName] = useState(planToEdit?.name || "");
  const [description, setDescription] = useState(planToEdit?.description || "");
  const [visibility, setVisibility] = useState(planToEdit?.visibility || "public");
  const [priceMonthly, setPriceMonthly] = useState(planToEdit?.priceMonthly ?? 49);
  const [priceYearly, setPriceYearly] = useState(planToEdit?.priceYearly ?? 490);
  const [currency, setCurrency] = useState(planToEdit?.currency || "USD");

  // Limits
  const [maxMembers, setMaxMembers] = useState(planToEdit?.limits?.maxMembers ?? 500);
  const [maxStaff, setStaffLimit] = useState(planToEdit?.limits?.maxStaff ?? 10);
  const [maxBranches, setBranchesLimit] = useState(planToEdit?.limits?.maxBranches ?? 1);

  // Fair Use Caps
  const [storageGb, setStorageGb] = useState(planToEdit?.fairUseCaps?.storageGb ?? 25);
  const [whatsappMonthly, setWhatsappMonthly] = useState(
    planToEdit?.fairUseCaps?.whatsappMessagesMonthly ?? 2000
  );

  // Selected Features
  const [selectedFeatures, setSelectedFeatures] = useState(
    planToEdit?.features ? [...planToEdit.features] : []
  );

  const toggleFeature = (featKey) => {
    setSelectedFeatures((prev) =>
      prev.includes(featKey) ? prev.filter((k) => k !== featKey) : [...prev, featKey]
    );
  };

  const handlePreSave = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Plan display name is required");
      return;
    }
    if (!isEdit && !key.trim()) {
      setError("Programmatic plan key is required");
      return;
    }

    if (isEdit) {
      // If editing an existing plan, preview subscriber impact first!
      setImpactModalOpen(true);
    } else {
      executeSave();
    }
  };

  const executeSave = async () => {
    setLoading(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim(),
      priceMonthly: Number(priceMonthly),
      priceYearly: Number(priceYearly),
      currency,
      visibility,
      features: selectedFeatures,
      limits: {
        maxMembers: Number(maxMembers),
        maxStaff: Number(maxStaff),
        maxBranches: Number(maxBranches),
      },
      fairUseCaps: {
        storageGb: Number(storageGb),
        whatsappMessagesMonthly: Number(whatsappMonthly),
      },
    };

    try {
      if (isEdit) {
        await apiUpdatePlan(planToEdit._id, payload);
        platformToast.success(`Plan '${name}' updated`);
      } else {
        await apiCreatePlan({
          key: key.trim().toLowerCase(),
          ...payload,
        });
        platformToast.success(`Plan '${name}' created`);
      }
      setImpactModalOpen(false);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to persist plan configuration");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2.5">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="button" variant="primary" loading={loading} onClick={handlePreSave}>
        {isEdit ? "Review Impact & Save" : "Create Plan"}
      </Button>
    </div>
  );

  return (
    <>
      <Dialog
        isOpen={open}
        onClose={() => onOpenChange(false)}
        title={isEdit ? `Edit Tier: ${planToEdit?.name}` : "Create New Subscription Plan"}
        description="Configure commercial limits, storage allowances, and system capabilities."
        footer={footer}
        size="lg"
      >
        <form onSubmit={handlePreSave} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          {error && <Callout variant="danger">{error}</Callout>}

          {/* Basic Identification */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                Plan Key {!isEdit && <span className="text-[var(--platform-danger)]">*</span>}
              </label>
              <Input
                placeholder="e.g. enterprise"
                value={key}
                disabled={isEdit}
                onChange={(e) => setKey(e.target.value)}
                className="font-mono text-xs"
                required={!isEdit}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                Display Name <span className="text-[var(--platform-danger)]">*</span>
              </label>
              <Input
                placeholder="e.g. Enterprise Tier"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                Visibility
              </label>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="public">Public (Self-Serve)</option>
                <option value="hidden">Hidden / Enterprise Only</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Description
            </label>
            <Input
              placeholder="Target demographic and tier marketing description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Pricing Section */}
          <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] p-4 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Base List Pricing
            </span>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Monthly ($)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceMonthly}
                  onChange={(e) => setPriceMonthly(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Yearly ($)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceYearly}
                  onChange={(e) => setPriceYearly(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Currency
                </label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="EGP">EGP (E£)</option>
                  <option value="SAR">SAR (﷼)</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Hard Operational Limits */}
          <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] p-4 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Gym Capacity Limits
            </span>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Max Active Members
                </label>
                <Input
                  type="number"
                  min="1"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Max Staff Logins
                </label>
                <Input
                  type="number"
                  min="1"
                  value={maxStaff}
                  onChange={(e) => setStaffLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Max Branch Locations
                </label>
                <Input
                  type="number"
                  min="1"
                  value={maxBranches}
                  onChange={(e) => setBranchesLimit(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Fair-use Storage & Messaging */}
          <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] p-4 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Fair-Use Limits & Telemetry Caps
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  Max Storage Allowance (GB)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={storageGb}
                  onChange={(e) => setStorageGb(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--platform-text-secondary)] mb-1">
                  WhatsApp Quota (Messages/Mo)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={whatsappMonthly}
                  onChange={(e) => setWhatsappMonthly(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Feature Entitlements Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                Feature Entitlements ({selectedFeatures.length} enabled)
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedFeatures(availableFeatures.map((f) => f.key))}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedFeatures([])}
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
              {availableFeatures.map((feat) => {
                const checked = selectedFeatures.includes(feat.key);
                return (
                  <label
                    key={feat.key}
                    className={`flex items-start gap-2.5 p-2 rounded cursor-pointer border transition-colors ${
                      checked
                        ? "bg-[var(--platform-surface)] border-[var(--platform-accent)]"
                        : "border-transparent hover:bg-[var(--platform-surface)]"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleFeature(feat.key)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--platform-text-primary)]">
                          {feat.name}
                        </span>
                        {feat.isCore && (
                          <Badge variant="info" size="xs">
                            Core
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--platform-text-muted)] block truncate">
                        {feat.key}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </Dialog>

      {/* Impact Preview Diff Modal */}
      {isEdit && (
        <PlanImpactModal
          open={impactModalOpen}
          onOpenChange={setImpactModalOpen}
          plan={planToEdit}
          targetFeatures={selectedFeatures}
          onConfirmSave={executeSave}
          saving={loading}
        />
      )}
    </>
  );
}
