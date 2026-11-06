import { useEffect, useState } from "react";
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
import { isValidProgrammaticKey } from "../../lib/utils/validation";

export const FEATURE_CATEGORIES = [
  { value: "core", label: "Core" },
  { value: "members", label: "Members" },
  { value: "sales", label: "Sales" },
  { value: "coaching", label: "Coaching" },
  { value: "finance", label: "Finance" },
  { value: "communication", label: "Communication" },
  { value: "analytics", label: "Analytics" },
  { value: "integrations", label: "Integrations" },
];

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

  useEffect(() => {
    if (!open) return;
    setKey(featureToEdit?.key || "");
    setName(featureToEdit?.name || "");
    setDescription(featureToEdit?.description || "");
    setCategory(featureToEdit?.category || "core");
    setIsCore(Boolean(featureToEdit?.isCore));
    setIsActive(featureToEdit ? featureToEdit.isActive !== false : true);
    setError(null);
  }, [open, featureToEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameTrim = name.trim();
    if (!nameTrim) {
      setError("Feature display name is required");
      return;
    }
    if (nameTrim.length > 120) {
      setError("Feature display name must not exceed 120 characters");
      return;
    }
    if (!isEdit && !isValidProgrammaticKey(key)) {
      setError("Programmatic feature key must be 2–60 characters (letters, numbers, dashes, underscores)");
      return;
    }
    if (description && description.trim().length > 500) {
      setError("Description must not exceed 500 characters");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit) {
        await apiUpdateFeature(featureToEdit._id, {
          name: nameTrim,
          description: description.trim(),
          category,
          isCore,
          isActive,
        });
        platformToast.success("Feature updated successfully");
      } else {
        await apiCreateFeature({
          key: key.trim().toLowerCase(),
          name: nameTrim,
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
              placeholder="e.g. receipt_thermal"
              value={key}
              disabled={isEdit}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono text-xs"
              required={!isEdit}
            />
            <span className="text-[11px] text-[var(--platform-text-muted)] mt-1 block">
              Lowercase letters, numbers, dashes, or underscores.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Category
            </label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {FEATURE_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
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
