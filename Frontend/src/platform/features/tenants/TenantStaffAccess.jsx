import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiGetTenantStaffAccess,
  apiListTenantStaff,
  apiUpdateTenantStaffAccess,
} from "../../lib/api/endpoints";
import { usePermission } from "../../lib/auth/PermissionContext";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { platformToast } from "../../ui/Toast";

const ROLE_ORDER = [
  "Owner",
  "General Manager",
  "Sales Manager",
  "Sales",
  "Coach Manager",
  "Coach",
  "Receptionist",
  "Accountant",
];

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative h-[22px] w-10 shrink-0 rounded-full border-none p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: checked ? "var(--platform-accent)" : "var(--platform-border-strong)" }}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-[var(--platform-surface)] shadow-sm transition-[left]"
        style={{ left: checked ? 21 : 3 }}
      />
    </button>
  );
}

function draftBadge(feature, on) {
  const isDefault = feature.isDefault ?? (feature.source === "revoked" || (feature.source === "default" && feature.enabled));
  if (on && isDefault) return { text: "Default", variant: "neutral" };
  if (on && !isDefault) return { text: "Extra", variant: "success" };
  if (!on && isDefault) return { text: "Removed", variant: "danger" };
  return null;
}

function enabledKeys(groups) {
  const keys = [];
  for (const group of groups || []) {
    for (const feature of group.features || []) {
      if (feature.enabled) keys.push(feature.key);
    }
  }
  return keys;
}

export default function TenantStaffAccess({ tenantId }) {
  const canWrite = usePermission("tenants.write");
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["tenant-staff", tenantId],
    queryFn: async () => {
      const res = await apiListTenantStaff(tenantId);
      return res.data.users || [];
    },
  });

  const accessQuery = useQuery({
    queryKey: ["tenant-staff-access", tenantId, selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const res = await apiGetTenantStaffAccess(tenantId, selectedId);
      return res.data;
    },
  });

  const users = staffQuery.data || [];
  const groups = accessQuery.data?.groups || [];
  const selected = users.find((person) => person._id === selectedId) || null;

  useEffect(() => {
    const flags = {};
    groups.forEach((group) => {
      group.features.forEach((feature) => {
        flags[feature.key] = feature.enabled;
      });
    });
    setDraft(flags);
  }, [accessQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions = useMemo(() => {
    const present = new Set(users.map((person) => person.role));
    const ordered = ROLE_ORDER.filter((role) => present.has(role));
    for (const role of present) {
      if (!ordered.includes(role)) ordered.push(role);
    }
    return [{ value: "all", label: "All roles" }, ...ordered.map((role) => ({ value: role, label: role }))];
  }, [users]);

  const visible = users.filter((person) => {
    if (roleFilter !== "all" && person.role !== roleFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (person.name || "").toLowerCase().includes(q) || (person.email || "").toLowerCase().includes(q);
  });

  const savedKeys = useMemo(() => enabledKeys(groups).sort().join("|"), [groups]);
  const draftKeys = useMemo(
    () => Object.entries(draft).filter(([, on]) => on).map(([key]) => key).sort().join("|"),
    [draft],
  );
  const dirty = Boolean(selectedId) && savedKeys !== draftKeys;

  const confirm = async () => {
    if (!selectedId || !dirty || !canWrite) return;
    const features = Object.entries(draft).filter(([, on]) => on).map(([key]) => key);
    setSaving(true);
    try {
      const res = await apiUpdateTenantStaffAccess(tenantId, selectedId, features);
      queryClient.setQueryData(["tenant-staff-access", tenantId, selectedId], res.data);
      platformToast.success(`Access updated for ${selected?.name || "staff member"}`);
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not save access");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const flags = {};
    groups.forEach((group) => {
      group.features.forEach((feature) => {
        flags[feature.key] = feature.enabled;
      });
    });
    setDraft(flags);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Staff</h3>
          <p className="mt-1 text-[11px] text-[var(--platform-text-muted)]">
            Everyone in this gym, including the owner.
          </p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
          aria-label="Search staff by name or email"
        />
        <Select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          options={roleOptions}
        />
        <div className="max-h-[520px] space-y-1 overflow-y-auto">
          {staffQuery.isLoading && (
            <p className="px-1 py-3 text-xs text-[var(--platform-text-muted)]">Loading staff…</p>
          )}
          {staffQuery.isError && (
            <p className="px-1 py-3 text-xs text-[var(--platform-danger)]">Could not load staff.</p>
          )}
          {!staffQuery.isLoading && visible.length === 0 && (
            <p className="px-1 py-3 text-xs text-[var(--platform-text-muted)]">No matching staff.</p>
          )}
          {visible.map((person) => {
            const active = person._id === selectedId;
            return (
              <button
                key={person._id}
                type="button"
                onClick={() => setSelectedId(person._id)}
                className={`flex w-full flex-col items-start gap-1 rounded-[var(--platform-radius-md)] border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-[var(--platform-accent)] bg-[var(--platform-accent-subtle)]"
                    : "border-transparent hover:bg-[var(--platform-surface-subtle)]"
                }`}
              >
                <span className="text-xs font-semibold text-[var(--platform-text-primary)]">{person.name}</span>
                <span className="w-full truncate text-[11px] text-[var(--platform-text-muted)]">{person.email}</span>
                <span className="flex flex-wrap items-center gap-1">
                  <Badge size="sm">{person.role}</Badge>
                  {person.isPrimaryOwner && <Badge size="sm" variant="accent">Primary owner</Badge>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {!selectedId && (
          <div className="rounded-[var(--platform-radius-lg)] border border-dashed border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 py-10 text-center text-xs text-[var(--platform-text-muted)]">
            Choose a staff member to edit their features.
          </div>
        )}

        {selectedId && accessQuery.isLoading && (
          <p className="px-1 py-6 text-xs text-[var(--platform-text-muted)]">Loading access…</p>
        )}

        {selectedId && accessQuery.isError && (
          <p className="px-1 py-6 text-xs text-[var(--platform-danger)]">Could not load access.</p>
        )}

        {selectedId && !accessQuery.isLoading && groups.length > 0 && (
          <>
            <p className="text-xs text-[var(--platform-text-secondary)]">
              Features for <strong className="text-[var(--platform-text-primary)]">{selected?.name || accessQuery.data?.user?.name}</strong>
              {" "}({selected?.role || accessQuery.data?.user?.role}). Defaults stay on until you change them.
              {!canWrite && " You can view this gym’s access. Saving requires tenant write permission."}
            </p>

            {groups.map((group) => (
              <div
                key={group.role}
                className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
              >
                <h3 className="mb-3 text-sm font-semibold text-[var(--platform-text-primary)]">{group.role}</h3>
                <div className="divide-y divide-[var(--platform-border-subtle)]">
                  {group.features.map((feature) => {
                    const on = Boolean(draft[feature.key]);
                    const label = draftBadge(feature, on);
                    const locked = feature.locked || !canWrite;
                    return (
                      <div
                        key={feature.key}
                        className="flex items-center gap-3 py-3"
                        style={{ opacity: feature.locked ? 0.72 : 1 }}
                      >
                        <span className="shrink-0 text-lg" aria-hidden>{feature.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--platform-text-primary)]">{feature.label}</span>
                            {label && <Badge size="sm" variant={label.variant}>{label.text}</Badge>}
                          </div>
                          <div className="text-[11px] text-[var(--platform-text-muted)]">{feature.description}</div>
                          {feature.locked && feature.lockReason && (
                            <div className="mt-1 text-[11px] text-[var(--platform-text-secondary)]">{feature.lockReason}</div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`text-[11px] font-semibold ${on ? "text-[var(--platform-success)]" : "text-[var(--platform-danger)]"}`}>
                            {on ? "Enabled" : "Disabled"}
                          </span>
                          <Toggle
                            checked={on}
                            disabled={locked}
                            onChange={(value) => setDraft((prev) => ({ ...prev, [feature.key]: value }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {canWrite && (
              <div className="sticky bottom-4 z-10 flex justify-end gap-2 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-3 shadow-md">
                <Button variant="ghost" disabled={!dirty || saving} onClick={reset}>Reset</Button>
                <Button disabled={!dirty || saving} loading={saving} onClick={confirm}>Confirm access</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
