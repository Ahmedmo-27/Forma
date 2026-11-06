import { useState, useEffect } from "react";
import { Copy, Check, ExternalLink, KeyRound, Building2 } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Checkbox } from "../../ui/Checkbox";
import { Callout } from "../../ui/Callout";
import { CopyChip } from "../../ui/CopyChip";
import { apiOnboardTenant, apiGetPlans } from "../../lib/api/endpoints";
import { platformToast } from "../../ui/Toast";
import { isValidSlug, isValidEmail } from "../../lib/utils/validation";

export function OnboardTenantModal({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null); // { tenant, owner, invite }

  const [form, setForm] = useState({
    name: "",
    slug: "",
    ownerName: "",
    ownerEmail: "",
    planKey: "basic",
    cycle: "monthly",
    trialDays: 14,
    isLifetime: false,
    amountPaid: 0,
    currency: "EGP",
  });

  useEffect(() => {
    if (isOpen) {
      setCredentials(null);
      setError("");
      setForm({
        name: "",
        slug: "",
        ownerName: "",
        ownerEmail: "",
        planKey: "basic",
        cycle: "monthly",
        trialDays: 14,
        isLifetime: false,
        amountPaid: 0,
        currency: "EGP",
      });

      apiGetPlans()
        .then((res) => setPlans(res.data || []))
        .catch(() => {});
    }
  }, [isOpen]);

  const handleNameChange = (name) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setForm((prev) => ({
      ...prev,
      name,
      slug: prev.slug === "" || prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ? slug : prev.slug,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameTrim = form.name.trim();
    const slugTrim = form.slug.trim().toLowerCase();
    const emailTrim = form.ownerEmail.trim();

    if (!nameTrim || !slugTrim || !emailTrim) {
      setError("Please complete all required fields (Name, Slug, Owner Email).");
      return;
    }
    if (nameTrim.length > 120) {
      setError("Gym name must not exceed 120 characters.");
      return;
    }
    if (!isValidSlug(slugTrim)) {
      setError("Gym slug must be 2–50 characters and contain only lowercase letters, numbers, and dashes.");
      return;
    }
    if (!isValidEmail(emailTrim)) {
      setError("Please enter a valid owner email address.");
      return;
    }
    if (form.ownerName && form.ownerName.trim().length > 120) {
      setError("Owner name must not exceed 120 characters.");
      return;
    }

    const trial = Number(form.trialDays);
    if (!form.isLifetime && (isNaN(trial) || !Number.isInteger(trial) || trial < 1 || trial > 365)) {
      setError("Trial duration must be a whole number of days between 1 and 365.");
      return;
    }

    const paid = Number(form.amountPaid);
    if (isNaN(paid) || paid < 0) {
      setError("Amount paid must be a non-negative number.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await apiOnboardTenant({
        ...form,
        name: nameTrim,
        slug: slugTrim,
        ownerEmail: emailTrim,
        ownerName: form.ownerName.trim(),
        trialDays: form.isLifetime ? 0 : trial,
        amountPaid: paid,
      });

      platformToast.success(`Gym '${res.data.tenant.name}' successfully onboarded!`);
      setCredentials(res.data);
      onSuccess?.();
    } catch (err) {
      setError(err.message || "Failed to onboard gym tenant");
    } finally {
      setLoading(false);
    }
  };

  // If successfully onboarded, display the operator credentials dialog
  if (credentials) {
    return (
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="Gym Onboarded Successfully"
        description="The tenant workspace and initial owner account have been provisioned."
        size="md"
        footer={
          <Button variant="primary" onClick={onClose}>
            Done & View Subscribers
          </Button>
        }
      >
        <div className="space-y-4 text-left">
          <Callout variant="success" title="Tenant Workspace Provisioned">
            Gym workspace <strong>{credentials.tenant.name}</strong> (/{credentials.tenant.slug}) is now ready.
          </Callout>

          <div className="p-4 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-3">
            <div className="text-xs font-semibold text-[var(--platform-text-primary)]">
              Owner Credentials & Password Setup
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--platform-text-muted)]">Owner Name:</span>
                <span className="font-medium text-[var(--platform-text-primary)]">
                  {credentials.owner.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--platform-text-muted)]">Owner Email:</span>
                <CopyChip value={credentials.owner.email} />
              </div>
              {credentials.invite?.inviteUrl && (
                <div className="space-y-1 pt-2 border-t border-[var(--platform-border-subtle)]">
                  <span className="text-[var(--platform-text-muted)] block">
                    Password Setup Invite URL (Valid for 72h):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}${credentials.invite.inviteUrl}`}
                      className="w-full h-7 px-2 text-[11px] platform-mono rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface)] border border-[var(--platform-border-strong)] text-[var(--platform-text-primary)] select-all"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      leftIcon={Copy}
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}${credentials.invite.inviteUrl}`
                        );
                        platformToast.success("Invite URL copied to clipboard");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Onboard New Gym Tenant"
      description="Create a new gym organization with its initial administrator and subscription tier."
      size="md"
      footer={
        <>
          <Button variant="ghost" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit}>
            Provision Tenant
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        {error && (
          <Callout variant="danger" onDismiss={() => setError("")}>
            {error}
          </Callout>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Gym Name"
            placeholder="e.g. Apex Performance"
            required
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
          />

          <Input
            label="Subdomain / Slug"
            placeholder="apex-performance"
            isMono
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().trim() })}
            helperText="Used for gym portal URL /:slug"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Owner Full Name"
            placeholder="e.g. John Doe"
            required
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
          />

          <Input
            label="Owner Email Address"
            type="email"
            placeholder="owner@apexfitness.com"
            required
            value={form.ownerEmail}
            onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Plan Tier"
            value={form.planKey}
            onChange={(e) => setForm({ ...form, planKey: e.target.value })}
            options={
              plans.length > 0
                ? plans.map((p) => ({ value: p.key, label: p.name }))
                : [
                    { value: "basic", label: "Basic" },
                    { value: "gold", label: "Gold" },
                    { value: "platinum", label: "Platinum" },
                  ]
            }
          />

          <Select
            label="Billing Cycle"
            disabled={form.isLifetime}
            value={form.isLifetime ? "lifetime" : form.cycle}
            onChange={(e) => setForm({ ...form, cycle: e.target.value })}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly (Annual)" },
              { value: "lifetime", label: "Lifetime Pass" },
            ]}
          />

          <Input
            label="Trial Period (Days)"
            type="number"
            disabled={form.isLifetime}
            value={form.isLifetime ? 0 : form.trialDays}
            onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
          />
        </div>

        {/* Lifetime License Checkbox & Upfront Paid */}
        <div className="p-3.5 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] space-y-3">
          <Checkbox
            label="Issue as Lifetime License"
            description="Activates immediately without recurring renewal or expiration."
            checked={form.isLifetime}
            onChange={(checked) =>
              setForm({
                ...form,
                isLifetime: checked,
                cycle: checked ? "lifetime" : "monthly",
              })
            }
          />

          {form.isLifetime && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--platform-border-subtle)]">
              <Input
                label="Amount Paid ($)"
                type="number"
                value={form.amountPaid}
                onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
              />
              <Select
                label="Currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                options={[
                  { value: "USD", label: "USD ($)" },
                  { value: "EGP", label: "EGP (LE)" },
                  { value: "EUR", label: "EUR (€)" },
                ]}
              />
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}
