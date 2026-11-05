import { useState, useEffect } from "react";
import {
  Dialog,
  Button,
  Input,
  Select,
  Callout,
  platformToast,
} from "../../ui";
import { apiUpdatePlatformUser } from "../../lib/api/endpoints";

export default function EditPlatformUserModal({
  open,
  onOpenChange,
  userToEdit = null,
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [role, setRole] = useState("support");
  const [status, setStatus] = useState("active");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (userToEdit) {
      setRole(userToEdit.role || "support");
      setStatus(userToEdit.status || "active");
      setReason("");
      setError(null);
    }
  }, [userToEdit, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 5) {
      setError("A documented audit reason (at least 5 chars) is strictly mandatory for operator modifications");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiUpdatePlatformUser(userToEdit._id, {
        role,
        status,
        reason: reason.trim(),
      });

      platformToast.success(`Platform operator '${userToEdit.name}' updated`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to update operator");
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
        Save Modifications
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={`Modify Operator: ${userToEdit?.name}`}
      description="Adjust access tier or disable operator account."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout variant="danger">{error}</Callout>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Platform Role
            </label>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="support">Support</option>
              <option value="billing">Billing</option>
              <option value="analyst">Analyst</option>
              <option value="super_admin">Super Admin</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Account Status
            </label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="disabled">Disabled (Suspended)</option>
            </Select>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--platform-warning-border)] bg-[var(--platform-warning-surface)] space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--platform-warning)]">
            Mandatory Operator Audit Reason *
          </label>
          <Input
            placeholder="e.g. Role transition to Billing Team ref HR Promotion #11"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-[var(--platform-surface)]"
            required
          />
          <span className="text-[10px] text-[var(--platform-text-muted)] block">
            Etched permanently into the tamper-evident platform audit stream.
          </span>
        </div>
      </form>
    </Dialog>
  );
}
