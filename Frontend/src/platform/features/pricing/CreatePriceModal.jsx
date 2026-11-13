import { useState, useEffect } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Switch,
  Callout,
  platformToast,
} from "../../ui";
import { apiCreatePlanPrice, apiUpdatePlanPrice } from "../../lib/api/endpoints";
import { isNonNegativeNumber } from "../../lib/utils/validation";

export default function CreatePriceModal({
  open,
  onOpenChange,
  priceToEdit = null,
  availablePlans = [],
  onSaved,
}) {
  const isEdit = Boolean(priceToEdit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [intervalCount, setIntervalCount] = useState(1);
  const [amount, setAmount] = useState(49);
  const [validUntil, setValidUntil] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState("");

  const originalAmount = priceToEdit?.amount ?? 0;
  const isAmountChanged = isEdit && Number(amount) !== Number(originalAmount);

  useEffect(() => {
    if (priceToEdit) {
      setPlanId(priceToEdit.planId?._id || priceToEdit.planId || "");
      setCycle(priceToEdit.cycle || "monthly");
      setIntervalCount(priceToEdit.intervalCount || 1);
      setAmount(priceToEdit.amount || 0);
      setValidUntil(
        priceToEdit.validUntil
          ? new Date(priceToEdit.validUntil).toISOString().split("T")[0]
          : ""
      );
      setIsActive(priceToEdit.isActive !== false);
      setReason("");
    } else {
      if (availablePlans.length > 0) {
        setPlanId(availablePlans[0]._id);
      }
      setCycle("monthly");
      setIntervalCount(1);
      setAmount(49);
      setValidUntil("");
      setIsActive(true);
      setReason("");
    }
  }, [priceToEdit, availablePlans, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!planId) {
      setError("Please select a target plan");
      return;
    }
    if (!isNonNegativeNumber(amount)) {
      setError("Please provide a valid non-negative price amount");
      return;
    }
    const count = Math.floor(Number(intervalCount));
    if (!Number.isFinite(count) || count < 1) {
      setError("Interval count must be a whole number of at least 1");
      return;
    }
    if (validUntil && isNaN(Date.parse(validUntil))) {
      setError("Please enter a valid expiration date");
      return;
    }
    if (isAmountChanged && (!reason || reason.trim().length < 5)) {
      setError("A documented audit reason (at least 5 chars) is mandatory when modifying price amounts");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      planId,
      cycle,
      intervalCount: count,
      amount: Number(amount),
      currency: "EGP",
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      isActive,
    };

    if (isAmountChanged) {
      payload.reason = reason.trim();
    }

    try {
      if (isEdit) {
        await apiUpdatePlanPrice(priceToEdit._id, payload);
        platformToast.success("Price tier updated successfully");
      } else {
        await apiCreatePlanPrice(payload);
        platformToast.success("New price tier authored");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to persist price tier");
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
        {isEdit ? "Update Price Tier" : "Create Price Tier"}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEdit ? "Edit Plan Pricing Tier" : "Define New Price Tier"}
      description="Attach an EGP price and any month/year duration length to a subscription tier."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout variant="danger">{error}</Callout>}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Target Plan <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            disabled={isEdit}
          >
            {availablePlans.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.key})
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Duration Unit <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Select
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              disabled={isEdit}
            >
              <option value="monthly">Months</option>
              <option value="yearly">Years</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Interval Count <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Input
              type="number"
              min="1"
              step="1"
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
              disabled={isEdit}
              required
            />
            <span className="text-[10px] text-[var(--platform-text-muted)] mt-1 block">
              e.g. unit Months + count 3 = 3 months; unit Years + count 2 = 2 years
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Price Amount <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Currency
            </label>
            <Input value="EGP" readOnly />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Valid Until Date (Optional)
          </label>
          <Input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>

        {/* If price amount modified on edit, require mandatory audit reason */}
        {isAmountChanged && (
          <div className="p-3 rounded-lg border border-[var(--platform-warning-border)] bg-[var(--platform-warning-surface)] space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--platform-warning)]">
              Mandatory Reason for Price Modification *
            </label>
            <Input
              placeholder="e.g. Approved Q3 Commercial Restructure ref Board Mtg #41"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-[var(--platform-surface)]"
              required
            />
            <span className="text-[10px] text-[var(--platform-text-muted)] block">
              A permanent `price_change` billing event will be appended to the platform immutable ledger.
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--platform-border-subtle)] flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--platform-text-primary)]">
              Sales Open
            </span>
            <p className="text-[11px] text-[var(--platform-text-muted)]">
              When toggled off, checkout blocks subscription purchase on this tier.
            </p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </form>
    </Dialog>
  );
}
