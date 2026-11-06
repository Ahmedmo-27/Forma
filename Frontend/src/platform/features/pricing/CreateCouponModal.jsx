import { useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Checkbox,
  Switch,
  Callout,
  platformToast,
} from "../../ui";
import { apiCreateCoupon } from "../../lib/api/endpoints";
import { isPositiveInteger } from "../../lib/utils/validation";

export default function CreateCouponModal({
  open,
  onOpenChange,
  availablePlans = [],
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [code, setCode] = useState("");
  const [type, setType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState(20);
  const [currency, setCurrency] = useState("USD");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [selectedPlanKeys, setSelectedPlanKeys] = useState([]);
  const [selectedCycles, setSelectedCycles] = useState(["monthly", "yearly"]);

  const togglePlanKey = (key) => {
    setSelectedPlanKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleCycle = (cycle) => {
    setSelectedCycles((prev) =>
      prev.includes(cycle) ? prev.filter((c) => c !== cycle) : [...prev, cycle]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const codeTrim = code.trim().toUpperCase();
    if (!codeTrim) {
      setError("Coupon promotional code is required");
      return;
    }
    if (codeTrim.length > 50 || !/^[A-Z0-9_-]+$/.test(codeTrim)) {
      setError("Coupon code must be 1–50 alphanumeric characters, hyphens, or underscores");
      return;
    }
    const val = Number(discountValue);
    if (discountValue === "" || isNaN(val) || val <= 0) {
      setError("Please provide a valid discount value greater than zero");
      return;
    }
    if (type === "percentage" && val > 100) {
      setError("Percentage discount cannot exceed 100%");
      return;
    }
    if (maxRedemptions !== "" && !isPositiveInteger(maxRedemptions)) {
      setError("Maximum redemptions must be a positive whole number");
      return;
    }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      setError("Expiration date must be in the future");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiCreateCoupon({
        code: codeTrim,
        type,
        discountValue: val,
        currency,
        appliesTo: {
          planKeys: selectedPlanKeys,
          cycles: selectedCycles,
        },
        maxRedemptions: maxRedemptions !== "" ? Number(maxRedemptions) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isActive,
      });

      platformToast.success(`Promotional code '${code.trim().toUpperCase()}' created`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to create coupon code");
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
        Create Coupon
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Create Promotional Coupon"
      description="Issue discount codes applicable at checkout or onboarding billing."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && <Callout variant="danger">{error}</Callout>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Coupon Code <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Input
              placeholder="e.g. SUMMER2026"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono uppercase font-bold"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Discount Type
            </label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percentage">Percentage Off (%)</option>
              <option value="fixed_amount">Fixed Amount Off ($)</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Discount Value ({type === "percentage" ? "%" : currency}) <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Input
              type="number"
              min="1"
              max={type === "percentage" ? 100 : undefined}
              step={type === "percentage" ? 1 : 0.01}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              required
            />
          </div>

          {type === "fixed_amount" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
                Currency
              </label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="EGP">EGP (E£)</option>
                <option value="SAR">SAR (﷼)</option>
              </Select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Max Redemptions
            </label>
            <Input
              type="number"
              min="1"
              placeholder="Unlimited"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Expiration Date (Optional)
          </label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {/* Applies To: Cycles */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
            Eligible Billing Cycles
          </label>
          <div className="flex gap-4 p-2.5 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)]">
            {["monthly", "yearly", "lifetime"].map((c) => (
              <label key={c} className="flex items-center gap-2 cursor-pointer text-xs">
                <Checkbox
                  checked={selectedCycles.includes(c)}
                  onCheckedChange={() => toggleCycle(c)}
                />
                <span className="capitalize">{c}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Applies To: Specific Plans */}
        {availablePlans.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
                Eligible Plans (Leave empty for all plans)
              </label>
              {selectedPlanKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedPlanKeys([])}
                  className="text-[11px] text-[var(--platform-accent)] hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 p-2.5 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] max-h-32 overflow-y-auto">
              {availablePlans.map((p) => {
                const checked = selectedPlanKeys.includes(p.key);
                return (
                  <label
                    key={p.key}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer border transition-colors ${
                      checked
                        ? "bg-[var(--platform-surface)] border-[var(--platform-accent)] font-medium"
                        : "border-[var(--platform-border-subtle)] hover:bg-[var(--platform-surface)]"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePlanKey(p.key)}
                    />
                    <span>{p.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--platform-border-subtle)] flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--platform-text-primary)]">
              Active Status
            </span>
            <p className="text-[11px] text-[var(--platform-text-muted)]">
              Inactive coupons are rejected at checkout.
            </p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </form>
    </Dialog>
  );
}
