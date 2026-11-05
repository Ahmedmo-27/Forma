import { useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Switch,
  Callout,
  platformToast,
} from "../../ui";
import { apiCreateFeature, apiUpdateFeature } from "../../lib/api/endpoints";

export default function CreateFeatureModal({ open, onOpenChange, featureToEdit = null, onSaved }) {
  const isEdit = Boolean(featureToEdit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [key, setKey] = useState(featureToEdit?.key || "");
  const [name, setName] = useState(featureToEdit?.name || "");
  const [description, setDescription] = useState(featureToEdit?.description || "");
  const [category, setCategory] = useState(featureToEdit?.category || "core");
  const [isCore, setIsCore] = useState(featureToEdit?.isCore || false);
  const [isActive, setIsActive] = useState(featureToEdit ? featureToEdit.isActive : true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Feature display name is required");
      return;
    }
    if (!isEdit && !key.trim()) {
      setError("Feature programmatic key is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit) {
        await apiUpdateFeature(featureToEdit._id, {
          name: name.trim(),
          description: description.trim(),
          category,
          isCore,
          isActive,
        });
        platformToast.success("Feature updated successfully");
      } else {
        await apiCreateFeature({
          key: key.trim().toLowerCase(),
          name: name.trim(),
          description: description.trim(),
          category,
          isCore,
          isActive,
        });
        platformToast.success(`Feature '${key.trim().toLowerCase()}' registered`);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to save feature catalog entry");
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
        {isEdit ? "Save Changes" : "Create Feature"}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEdit ? "Edit Feature Flag" : "Define New Feature Flag"}
      description="Features are granular system capabilities evaluated by tenant policy middleware and UI gates."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout variant="danger">{error}</Callout>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Feature Key {!isEdit && <span className="text-[var(--platform-danger)]">*</span>}
            </label>
            <Input
              placeholder="e.g. pos.receipt_thermal"
              value={key}
              disabled={isEdit}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono text-xs"
              required={!isEdit}
            />
            <span className="text-[11px] text-[var(--platform-text-muted)] mt-1 block">
              Lowercase dot-notated identifier.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Category
            </label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="core">Core Capabilities</option>
              <option value="pos">Point of Sale (POS)</option>
              <option value="crm">CRM & Members</option>
              <option value="automation">WhatsApp & Automation</option>
              <option value="analytics">Enterprise Analytics</option>
              <option value="hardware">Access Control & Hardware</option>
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Display Name <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Input
            placeholder="e.g. Thermal Receipt Printing"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Description
          </label>
          <Input
            placeholder="Brief explanation of capability or hardware requirement"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="pt-2 border-t border-[var(--platform-border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-[var(--platform-text-primary)]">Core Entitlement</span>
              <p className="text-[11px] text-[var(--platform-text-muted)]">
                If enabled, new tiers include this capability by default.
              </p>
            </div>
            <Switch checked={isCore} onCheckedChange={setIsCore} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-[var(--platform-text-primary)]">Catalog Status Active</span>
              <p className="text-[11px] text-[var(--platform-text-muted)]">
                Deactivated features cannot be assigned to plans or tenant overrides.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
