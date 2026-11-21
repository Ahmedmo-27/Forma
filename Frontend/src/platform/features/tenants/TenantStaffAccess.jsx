import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import {
  apiCreateTenantStaff,
  apiDeleteTenantStaff,
  apiGetTenantStaffAccess,
  apiListTenantLocations,
  apiListTenantStaff,
  apiUpdateTenantStaff,
  apiUpdateTenantStaffAccess,
} from "../../lib/api/endpoints";
import { usePermission } from "../../lib/auth/PermissionContext";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Dialog } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { platformToast } from "../../ui/Toast";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import { FeatureIcon } from "../../../lib/featureIcons";
import { getPasswordStrengthError, PASSWORD_REQUIREMENTS_HINT } from "../../../lib/validation";

const ROLE_ORDER = [
  "Owner",
  "General Manager",
  "Sales Manager",
  "Sales",
  "Head Coach",
  "Coach",
  "Receptionist",
  "Accountant",
  "Retail",
];

const ROLE_OPTIONS = ROLE_ORDER.map((role) => ({ value: role, label: role }));
const CREATABLE_ROLE_OPTIONS = ROLE_ORDER
  .filter((role) => role !== "Owner")
  .map((role) => ({ value: role, label: role }));

const EMPTY_PROFILE = {
  name: "",
  email: "",
  username: "",
  mobile_number: "",
  role: "Sales",
  password: "",
};

const EMPTY_CREATE = {
  name: "",
  email: "",
  username: "",
  mobile_number: "",
  role: "Sales",
  password: "",
  canAccessAllLocations: false,
  allowedLocationIds: [],
};

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

function profileFromPerson(person) {
  if (!person) return { ...EMPTY_PROFILE };
  return {
    name: person.name || "",
    email: person.email || "",
    username: person.username || "",
    mobile_number: person.mobile_number || "",
    role: person.role || "Sales",
    password: "",
  };
}

function BranchAccessEditor({
  locations,
  canAccessAll,
  selectedIds,
  onCanAccessAllChange,
  onToggleId,
  disabled,
  lockedAll,
}) {
  return (
    <div className="space-y-3">
      <Checkbox
        label="All locations"
        description={lockedAll ? "Owners always have access to every branch." : "No branch restriction for this person."}
        checked={Boolean(canAccessAll) || lockedAll}
        disabled={disabled || lockedAll}
        onCheckedChange={(checked) => onCanAccessAllChange?.(Boolean(checked))}
      />
      {!canAccessAll && !lockedAll && (
        <div className="space-y-2">
          {locations.length === 0 && (
            <p className="text-[11px] text-[var(--platform-text-muted)]">
              No branches yet. Add one on the Branches tab first.
            </p>
          )}
          {locations.map((loc) => {
            const id = String(loc._id);
            const checked = selectedIds.includes(id);
            return (
              <label
                key={id}
                className={`flex items-center gap-2.5 rounded-[var(--platform-radius-md)] border px-3 py-2 ${
                  checked
                    ? "border-[var(--platform-accent)] bg-[var(--platform-accent-subtle)]"
                    : "border-[var(--platform-border)]"
                } ${disabled ? "opacity-60" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--platform-accent)]"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => onToggleId?.(id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 text-xs font-semibold text-[var(--platform-text-primary)]">
                  {loc.name}
                </span>
                <span className="platform-mono text-[11px] text-[var(--platform-text-muted)]">{loc.locationId}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TenantStaffAccess({ tenantId }) {
  const canWrite = usePermission("tenants.write");
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [locationDraft, setLocationDraft] = useState({
    canAccessAllLocations: false,
    allowedLocationIds: [],
  });
  const [savingLocations, setSavingLocations] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["tenant-staff", tenantId],
    queryFn: async () => {
      const res = await apiListTenantStaff(tenantId);
      return res.data;
    },
  });

  const locationsQuery = useQuery({
    queryKey: ["tenant-locations", tenantId],
    queryFn: async () => {
      const res = await apiListTenantLocations(tenantId);
      return res.data;
    },
    enabled: Boolean(tenantId),
  });

  const accessQuery = useQuery({
    queryKey: ["tenant-staff-access", tenantId, selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const res = await apiGetTenantStaffAccess(tenantId, selectedId);
      return res.data;
    },
  });

  const users = useMemo(() => staffQuery.data?.users || [], [staffQuery.data]);
  const locations = locationsQuery.data?.locations || [];
  const groups = useMemo(() => accessQuery.data?.groups || [], [accessQuery.data]);
  const selected = users.find((person) => person._id === selectedId) || null;
  const accessUser = accessQuery.data?.user || selected;

  useEffect(() => {
    setProfile(profileFromPerson(selected));
  }, [selectedId, selected?.name, selected?.email, selected?.username, selected?.mobile_number, selected?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const source = accessUser || selected;
    if (!source) {
      setLocationDraft({ canAccessAllLocations: false, allowedLocationIds: [] });
      return;
    }
    setLocationDraft({
      canAccessAllLocations: Boolean(source.canAccessAllLocations) || source.role === "Owner" || source.isPrimaryOwner,
      allowedLocationIds: (source.allowedLocationIds || []).map(String),
    });
  }, [accessQuery.data, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return (
      (person.name || "").toLowerCase().includes(q)
      || (person.email || "").toLowerCase().includes(q)
      || (person.username || "").toLowerCase().includes(q)
    );
  });

  const savedKeys = useMemo(() => enabledKeys(groups).sort().join("|"), [groups]);
  const draftKeys = useMemo(
    () => Object.entries(draft).filter(([, on]) => on).map(([key]) => key).sort().join("|"),
    [draft],
  );
  const dirty = Boolean(selectedId) && savedKeys !== draftKeys;

  const baseline = profileFromPerson(selected);
  const profileDirty = Boolean(selectedId) && (
    profile.name.trim() !== baseline.name
    || profile.email.trim() !== baseline.email
    || profile.username.trim() !== baseline.username
    || profile.mobile_number.trim() !== baseline.mobile_number
    || profile.role !== baseline.role
    || Boolean(profile.password)
  );

  const locationBaseline = {
    canAccessAllLocations: Boolean(accessUser?.canAccessAllLocations) || accessUser?.role === "Owner" || accessUser?.isPrimaryOwner,
    allowedLocationIds: (accessUser?.allowedLocationIds || []).map(String).sort().join("|"),
  };
  const locationDirty = Boolean(selectedId) && !(
    Boolean(locationDraft.canAccessAllLocations) === Boolean(locationBaseline.canAccessAllLocations)
    && [...locationDraft.allowedLocationIds].map(String).sort().join("|") === locationBaseline.allowedLocationIds
  );

  const setProfileField = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const setCreateField = (field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const patchStaffCache = (updated) => {
    queryClient.setQueryData(["tenant-staff", tenantId], (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        users: (prev.users || []).map((person) => (
          person._id === updated._id ? { ...person, ...updated } : person
        )),
      };
    });
    queryClient.setQueryData(["tenant-staff-access", tenantId, selectedId], (prev) => (
      prev ? { ...prev, user: { ...(prev.user || {}), ...updated } } : prev
    ));
  };

  const confirmProfile = async () => {
    if (!selectedId || !profileDirty || !canWrite) return;

    const name = profile.name.trim();
    const email = profile.email.trim();
    const username = profile.username.trim();
    const mobile_number = profile.mobile_number.trim();

    if (!name) {
      platformToast.error("Name is required");
      return;
    }
    if (!email) {
      platformToast.error("Email is required");
      return;
    }
    if (!username) {
      platformToast.error("Username is required");
      return;
    }
    if (profile.password) {
      const passwordError = getPasswordStrengthError(profile.password);
      if (passwordError) {
        platformToast.error(passwordError);
        return;
      }
    }

    const payload = {
      name,
      email,
      username,
      mobile_number,
      role: profile.role,
    };
    if (profile.password) payload.password = profile.password;

    setSavingProfile(true);
    try {
      const res = await apiUpdateTenantStaff(tenantId, selectedId, payload);
      const updated = res.data.user;
      patchStaffCache(updated);
      if (updated?.role && selected?.role && updated.role !== selected.role) {
        queryClient.invalidateQueries({ queryKey: ["tenant-staff-access", tenantId, selectedId] });
      }
      setProfile({ ...profileFromPerson(updated), password: "" });
      platformToast.success(`Updated ${updated?.name || "staff member"}`);
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not save staff details");
    } finally {
      setSavingProfile(false);
    }
  };

  const resetProfile = () => setProfile(profileFromPerson(selected));

  const confirmLocations = async () => {
    if (!selectedId || !locationDirty || !canWrite) return;
    if (!locationDraft.canAccessAllLocations && locationDraft.allowedLocationIds.length === 0) {
      platformToast.error("Select at least one branch, or enable all locations");
      return;
    }
    setSavingLocations(true);
    try {
      const res = await apiUpdateTenantStaff(tenantId, selectedId, {
        canAccessAllLocations: locationDraft.canAccessAllLocations,
        allowedLocationIds: locationDraft.canAccessAllLocations ? [] : locationDraft.allowedLocationIds,
      });
      patchStaffCache(res.data.user);
      platformToast.success("Branch access updated");
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not save branch access");
    } finally {
      setSavingLocations(false);
    }
  };

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

  const openCreate = () => {
    setCreateForm({
      ...EMPTY_CREATE,
      canAccessAllLocations: false,
      allowedLocationIds: locations[0] ? [String(locations[0]._id)] : [],
    });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const name = createForm.name.trim();
    const email = createForm.email.trim();
    const mobile_number = createForm.mobile_number.trim();
    if (!name || !email || !mobile_number) {
      platformToast.error("Name, email, and mobile are required");
      return;
    }
    if (createForm.password) {
      const passwordError = getPasswordStrengthError(createForm.password);
      if (passwordError) {
        platformToast.error(passwordError);
        return;
      }
    }
    if (!createForm.canAccessAllLocations && createForm.allowedLocationIds.length === 0) {
      platformToast.error("Select at least one branch, or enable all locations");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        name,
        email,
        mobile_number,
        role: createForm.role,
        canAccessAllLocations: createForm.canAccessAllLocations,
        allowedLocationIds: createForm.canAccessAllLocations ? [] : createForm.allowedLocationIds,
      };
      if (createForm.username.trim()) payload.username = createForm.username.trim();
      if (createForm.password) payload.password = createForm.password;

      const res = await apiCreateTenantStaff(tenantId, payload);
      platformToast.success(res.data.invite ? "Staff created; invite issued" : "Staff created");
      if (res.data.overStaffQuota && res.data.staffQuotaWarning) {
        platformToast.warning(res.data.staffQuotaWarning);
      }
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["tenant-staff", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
      if (res.data.user?._id) setSelectedId(res.data.user._id);
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not create staff");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || selected?.isPrimaryOwner) return;
    setDeleting(true);
    try {
      const res = await apiDeleteTenantStaff(tenantId, selectedId);
      platformToast.success("Staff deleted");
      if (res.data.overStaffQuota && res.data.staffQuotaWarning) {
        platformToast.warning(res.data.staffQuotaWarning);
      }
      setDeleteOpen(false);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["tenant-staff", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
    } catch (error) {
      platformToast.error(error.response?.data?.message || "Could not delete staff");
    } finally {
      setDeleting(false);
    }
  };

  const lockedAllLocations = selected?.isPrimaryOwner || selected?.role === "Owner" || accessUser?.role === "Owner";

  return (
    <div className="space-y-4">
      {(staffQuery.data?.overStaffQuota || staffQuery.data?.staffQuotaWarning) && (
        <div className="flex items-start gap-2.5 rounded-[var(--platform-radius-lg)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Over allowed staff quota</p>
            <p className="mt-0.5 opacity-90">
              {staffQuery.data.staffQuotaWarning
                || `This gym is over its allowed staff quota (${staffQuery.data.staffQuota?.current}/${staffQuery.data.staffQuota?.max}).`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Staff</h3>
              <p className="mt-1 text-[11px] text-[var(--platform-text-muted)]">
                Everyone in this gym, including the owner.
              </p>
            </div>
            {canWrite && (
              <Button size="xs" onClick={openCreate}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            )}
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, or username"
            aria-label="Search staff by name, email, or username"
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
                  <span className="w-full truncate text-[11px] text-[var(--platform-text-muted)]">
                    @{person.username || "—"}
                  </span>
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
              Choose a staff member to edit their profile, branches, and features.
            </div>
          )}

          {selectedId && (
            <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Profile</h3>
                  <p className="mt-1 text-[11px] text-[var(--platform-text-muted)]">
                    Edit account details for {selected?.name || "this staff member"}.
                    {!canWrite && " Saving requires tenant write permission."}
                  </p>
                </div>
                {canWrite && !selected?.isPrimaryOwner && (
                  <Button size="xs" variant="ghost" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5 text-[var(--platform-danger)]" />
                    Delete
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Name"
                  value={profile.name}
                  onChange={(event) => setProfileField("name", event.target.value)}
                  disabled={!canWrite || savingProfile}
                  required
                />
                <Input
                  label="Username"
                  value={profile.username}
                  onChange={(event) => setProfileField("username", event.target.value)}
                  disabled={!canWrite || savingProfile}
                  required
                  isMono
                />
                <Input
                  label="Email"
                  type="email"
                  value={profile.email}
                  onChange={(event) => setProfileField("email", event.target.value)}
                  disabled={!canWrite || savingProfile}
                  required
                />
                <Input
                  label="Mobile"
                  value={profile.mobile_number}
                  onChange={(event) => setProfileField("mobile_number", event.target.value)}
                  disabled={!canWrite || savingProfile}
                />
                <Select
                  label="Role"
                  value={profile.role}
                  onChange={(event) => setProfileField("role", event.target.value)}
                  options={ROLE_OPTIONS}
                  disabled={!canWrite || savingProfile || selected?.isPrimaryOwner}
                  helperText={selected?.isPrimaryOwner ? "Primary owner role is locked. Transfer ownership first." : undefined}
                />
                <Input
                  label="New password"
                  type="password"
                  value={profile.password}
                  onChange={(event) => setProfileField("password", event.target.value)}
                  disabled={!canWrite || savingProfile}
                  helperText={`Leave blank to keep current. ${PASSWORD_REQUIREMENTS_HINT}.`}
                  autoComplete="new-password"
                />
              </div>

              {canWrite && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" disabled={!profileDirty || savingProfile} onClick={resetProfile}>
                    Reset
                  </Button>
                  <Button disabled={!profileDirty || savingProfile} loading={savingProfile} onClick={confirmProfile}>
                    Save profile
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedId && (
            <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Branch access</h3>
                <p className="mt-1 text-[11px] text-[var(--platform-text-muted)]">
                  Which branches this person can view and work in.
                </p>
              </div>
              <BranchAccessEditor
                locations={locations}
                canAccessAll={locationDraft.canAccessAllLocations}
                selectedIds={locationDraft.allowedLocationIds}
                lockedAll={lockedAllLocations}
                disabled={!canWrite || savingLocations || lockedAllLocations}
                onCanAccessAllChange={(checked) => setLocationDraft((prev) => ({
                  ...prev,
                  canAccessAllLocations: checked,
                  allowedLocationIds: checked ? [] : prev.allowedLocationIds,
                }))}
                onToggleId={(id, checked) => setLocationDraft((prev) => {
                  const setIds = new Set(prev.allowedLocationIds);
                  if (checked) setIds.add(id);
                  else setIds.delete(id);
                  return {
                    ...prev,
                    canAccessAllLocations: false,
                    allowedLocationIds: [...setIds],
                  };
                })}
              />
              {canWrite && !lockedAllLocations && (
                <div className="flex justify-end">
                  <Button
                    disabled={!locationDirty || savingLocations}
                    loading={savingLocations}
                    onClick={confirmLocations}
                  >
                    Save branch access
                  </Button>
                </div>
              )}
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
                          <span className="shrink-0 inline-flex" aria-hidden><FeatureIcon name={feature.icon} size={20} /></span>
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

      <Dialog
        isOpen={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="Add staff"
        description="Create a gym user. Leave password blank to send an invite link."
        size="lg"
        footer={(
          <>
            <Button variant="ghost" disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={creating} disabled={creating} onClick={handleCreate}>Create staff</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={createForm.name}
              onChange={(e) => setCreateField("name", e.target.value)}
              required
              disabled={creating}
            />
            <Input
              label="Username"
              value={createForm.username}
              onChange={(e) => setCreateField("username", e.target.value)}
              helperText="Optional — auto-generated if blank"
              isMono
              disabled={creating}
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateField("email", e.target.value)}
              required
              disabled={creating}
            />
            <Input
              label="Mobile"
              value={createForm.mobile_number}
              onChange={(e) => setCreateField("mobile_number", e.target.value)}
              required
              disabled={creating}
            />
            <Select
              label="Role"
              value={createForm.role}
              onChange={(e) => setCreateField("role", e.target.value)}
              options={CREATABLE_ROLE_OPTIONS}
              disabled={creating}
            />
            <Input
              label="Password"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateField("password", e.target.value)}
              helperText={`Leave blank to email an invite. ${PASSWORD_REQUIREMENTS_HINT}.`}
              autoComplete="new-password"
              disabled={creating}
            />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-[var(--platform-text-primary)]">Branch access</h4>
            <BranchAccessEditor
              locations={locations}
              canAccessAll={createForm.canAccessAllLocations}
              selectedIds={createForm.allowedLocationIds}
              disabled={creating}
              onCanAccessAllChange={(checked) => setCreateForm((prev) => ({
                ...prev,
                canAccessAllLocations: checked,
                allowedLocationIds: checked ? [] : prev.allowedLocationIds,
              }))}
              onToggleId={(id, checked) => setCreateForm((prev) => {
                const setIds = new Set(prev.allowedLocationIds);
                if (checked) setIds.add(id);
                else setIds.delete(id);
                return {
                  ...prev,
                  canAccessAllLocations: false,
                  allowedLocationIds: [...setIds],
                };
              })}
            />
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete staff"
        description={`Permanently delete “${selected?.name || "this staff member"}”? They will lose login access immediately.`}
        impactSummary="This cannot be undone. Reassign any members or tasks first if needed."
        confirmLabel="Delete staff"
        variant="danger"
        requireReason={false}
        loading={deleting}
      />
    </div>
  );
}
