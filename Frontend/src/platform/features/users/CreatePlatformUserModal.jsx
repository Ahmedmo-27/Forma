import { useEffect, useState } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Callout,
  platformToast,
} from "../../ui";
import { apiCreatePlatformUser } from "../../lib/api/endpoints";
import { isValidEmail, isValidAuditReason } from "../../lib/utils/validation";

export default function CreatePlatformUserModal({ open, onOpenChange, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("support");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setRole("support");
    setReason("");
    setError(null);
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameTrim = name.trim();
    const emailTrim = email.trim().toLowerCase();

    if (!nameTrim || !emailTrim || !password) {
      setError("Name, email, and a temporary password are required");
      return;
    }
    if (nameTrim.length > 120) {
      setError("Name must not exceed 120 characters");
      return;
    }
    if (!isValidEmail(emailTrim)) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setError("Temporary password must be at least 8 characters long");
      return;
    }
    if (password.length > 200) {
      setError("Temporary password must not exceed 200 characters");
      return;
    }
    if (reason && !isValidAuditReason(reason)) {
      setError("Audit reason must be at least 5 characters long");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiCreatePlatformUser({
        name: nameTrim,
        email: emailTrim,
        password,
        role,
        reason: reason.trim() || "Authorizing platform operator access",
      });

      platformToast.success(`Platform operator '${name}' created`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to create platform operator");
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
        Provision Operator
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Provision Platform Operator"
      description="Create credentials and assign granular RBAC roles for system administration."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout variant="danger">{error}</Callout>}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Full Name <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Input
            placeholder="e.g. Sarah Jenkins"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Operator Email <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Input
            type="email"
            placeholder="operator@gymflame.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Platform Role <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="support">Support (Read-only + Assist)</option>
              <option value="billing">Billing (Invoices & Payments)</option>
              <option value="analyst">Analyst (Metrics & Telemetry)</option>
              <option value="super_admin">Super Admin (Unrestricted)</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Temporary Password <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <Input
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Audit Reason (Optional)
          </label>
          <Input
            placeholder="e.g. New operations hire ref Ticket #204"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </form>
    </Dialog>
  );
}
