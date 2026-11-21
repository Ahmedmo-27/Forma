import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  apiListTenantLocations,
  apiCreateTenantLocation,
  apiUpdateTenantLocation,
  apiDeleteTenantLocation,
} from "../../lib/api/endpoints";
import { usePermission } from "../../lib/auth/PermissionContext";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Badge } from "../../ui/Badge";
import { UsageMeter } from "../../ui/UsageMeter";
import { platformToast } from "../../ui/Toast";
import { ConfirmDialog } from "../../shell/ConfirmDialog";

const EMPTY_FORM = { name: "", branch_location: "" };

export default function TenantBranchesPanel({ tenantId }) {
  const canWrite = usePermission("tenants.write");
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const locationsQuery = useQuery({
    queryKey: ["tenant-locations", tenantId],
    queryFn: async () => {
      const res = await apiListTenantLocations(tenantId);
      return res.data;
    },
    enabled: Boolean(tenantId),
  });

  const locations = locationsQuery.data?.locations || [];
  const quota = locationsQuery.data?.quota || {};
  const overQuota = Boolean(locationsQuery.data?.overQuota);
  const quotaWarning = locationsQuery.data?.quotaWarning;

  const usageCurrent = quota.current ?? locations.length;
  const usageMax = quota.max ?? null;

  const editingLabel = useMemo(() => {
    if (!editingId) return null;
    return locations.find((loc) => String(loc._id) === String(editingId))?.name || "branch";
  }, [editingId, locations]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (loc) => {
    setEditingId(loc._id);
    setForm({
      name: loc.name || "",
      branch_location: loc.branch_location || "",
    });
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      platformToast.error("Branch name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        branch_location: form.branch_location.trim(),
      };
      if (editingId) {
        const res = await apiUpdateTenantLocation(tenantId, editingId, payload);
        platformToast.success("Branch updated");
        if (res.data?.overQuota && res.data?.quotaWarning) {
          platformToast.warning(res.data.quotaWarning);
        }
      } else {
        const res = await apiCreateTenantLocation(tenantId, payload);
        platformToast.success("Branch created");
        if (res.data?.overQuota && res.data?.quotaWarning) {
          platformToast.warning(res.data.quotaWarning);
        }
      }
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["tenant-locations", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not save branch");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDeleteTenantLocation(tenantId, deleteTarget._id);
      platformToast.success("Branch deleted");
      if (res.data?.overQuota && res.data?.quotaWarning) {
        platformToast.warning(res.data.quotaWarning);
      }
      if (editingId && String(editingId) === String(deleteTarget._id)) resetForm();
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["tenant-locations", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not delete branch");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {(overQuota || quotaWarning) && (
        <div className="flex items-start gap-2.5 rounded-[var(--platform-radius-lg)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Over allowed branch quota</p>
            <p className="mt-0.5 opacity-90">
              {quotaWarning || `This gym is over its allowed branch quota (${usageCurrent}/${usageMax ?? "—"}).`}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Branches</h3>
            <p className="mt-1 text-[11px] text-[var(--platform-text-muted)]">
              Platform can add branches even when the gym’s plan quota is exceeded. A warning is shown when over quota.
              {!quota.multiBranchesEnabled && " Multi-branch is off on this gym’s plan."}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <UsageMeter
              label="Branch quota"
              current={usageCurrent}
              max={usageMax}
              unit="branches"
            />
          </div>
        </div>

        {locationsQuery.isLoading && (
          <p className="text-xs text-[var(--platform-text-muted)]">Loading branches…</p>
        )}
        {locationsQuery.isError && (
          <p className="text-xs text-[var(--platform-danger)]">Could not load branches.</p>
        )}

        {!locationsQuery.isLoading && locations.length === 0 && (
          <p className="text-xs text-[var(--platform-text-muted)]">No branches yet.</p>
        )}

        <div className="space-y-2">
          {locations.map((loc) => (
            <div
              key={loc._id}
              className={`flex flex-wrap items-center gap-3 rounded-[var(--platform-radius-md)] border px-3 py-2.5 ${
                String(editingId) === String(loc._id)
                  ? "border-[var(--platform-accent)] bg-[var(--platform-accent-subtle)]"
                  : "border-[var(--platform-border)] bg-[var(--platform-surface-subtle)]"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--platform-surface)] text-[var(--platform-accent)]">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--platform-text-primary)]">{loc.name}</span>
                  <Badge size="sm" variant="neutral">
                    <span className="platform-mono">{loc.locationId}</span>
                  </Badge>
                </div>
                {loc.branch_location ? (
                  <a
                    href={loc.branch_location}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block truncate text-[11px] text-[var(--platform-accent)] hover:underline"
                  >
                    {loc.branch_location}
                  </a>
                ) : (
                  <span className="mt-0.5 block text-[11px] text-[var(--platform-text-muted)]">No maps link</span>
                )}
              </div>
              {canWrite && (
                <div className="flex items-center gap-1">
                  <Button size="xs" variant="ghost" onClick={() => startEdit(loc)} disabled={saving}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setDeleteTarget(loc)}
                    disabled={saving || locations.length <= 1}
                    title={locations.length <= 1 ? "Cannot delete the last branch" : "Delete branch"}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[var(--platform-danger)]" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {canWrite && (
        <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            {editingId ? <Pencil className="h-4 w-4 text-[var(--platform-accent)]" /> : <Plus className="h-4 w-4 text-[var(--platform-accent)]" />}
            <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">
              {editingId ? `Edit ${editingLabel}` : "Add branch"}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              disabled={saving}
              required
              placeholder="e.g. Nasr City"
            />
            <Input
              label="Maps link"
              value={form.branch_location}
              onChange={(e) => setForm((prev) => ({ ...prev, branch_location: e.target.value }))}
              disabled={saving}
              placeholder="https://maps.google.com/..."
            />
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="ghost" disabled={saving} onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button disabled={saving || !form.name.trim()} loading={saving} onClick={handleSave}>
              {editingId ? "Save changes" : "Create branch"}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete branch"
        description={`Delete “${deleteTarget?.name || "this branch"}”? Members must already be reassigned.`}
        impactSummary="This removes the branch from the gym. Staff location grants that only listed this branch will need review."
        confirmLabel="Delete branch"
        variant="danger"
        requireReason={false}
        loading={deleting}
      />
    </div>
  );
}
