import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Shield, User } from 'lucide-react';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, Avatar, Badge } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import {
  listAccessUsersByRole,
  getUserAccess,
  updateUserAccess,
  updateRoleAccess,
  listLocations,
} from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import ChangeRoleField from '../../components/ChangeRoleField';
import { canChangeUserRole } from '../../lib/roles';
import { FeatureIcon } from '../../lib/featureIcons';

function LocationAccessEditor({
  title = 'Branch viewing access',
  description,
  locations,
  canAccessAll,
  onCanAccessAllChange,
  selectedIds,
  onToggleId,
  allMeansNoRestriction = false,
  disabled = false,
}) {
  return (
    <Card>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 12px', lineHeight: 1.45 }}>
          {description}
        </p>
      )}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}>
        <input
          type="checkbox"
          checked={Boolean(canAccessAll)}
          disabled={disabled}
          onChange={(e) => onCanAccessAllChange?.(e.target.checked)}
        />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {allMeansNoRestriction ? 'All locations (no restriction)' : 'All locations'}
        </span>
      </label>
      {!canAccessAll && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {locations.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
              No locations configured yet. Add branches in Settings → Locations.
            </p>
          )}
          {locations.map((loc) => {
            const checked = selectedIds.includes(String(loc._id));
            return (
              <label
                key={loc._id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  background: checked ? 'color-mix(in srgb, var(--navy) 6%, var(--card))' : 'var(--card)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => onToggleId?.(String(loc._id), e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{loc.name}</span>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{loc.locationId}</span>
              </label>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function canEditFeatureAccess(actor, targetRole) {
  const actorRole = typeof actor === 'string' ? actor : actor?.role;
  if (actorRole === 'Owner') return true;
  if (targetRole === 'Owner') return false;
  if (actorRole === 'General Manager') return targetRole !== 'Owner' && targetRole !== 'General Manager';
  if (actorRole === 'Sales Manager') return targetRole === 'Sales' || targetRole === 'Receptionist';
  if (actorRole === 'Coach Manager') return targetRole === 'Coach';
  const hasStaff = Boolean(
    typeof actor === 'object' && (
      actor?.accessOverrides?.add?.includes('staff') ||
      actor?.access?.includes('access_control')
    )
  );
  if (hasStaff) return targetRole !== 'General Manager';
  return false;
}

const ROLE_CHOICES = {
  Owner: ['General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'General Manager': ['Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'Sales Manager': ['Sales', 'Receptionist'],
  'Coach Manager': ['Coach'],
};

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 46, height: 28, borderRadius: 14,
        border: 'none', padding: 0, flexShrink: 0,
        background: checked ? 'var(--blue)' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.18s',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 22, height: 22, borderRadius: '50%',
        background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        transition: 'left 0.18s',
      }} />
    </button>
  );
}

function draftBadge(feature, on) {
  const isDefault = feature.isDefault ?? (feature.source === 'revoked' || (feature.source === 'default' && feature.enabled));
  if (on && isDefault) return { text: 'Default', color: 'var(--t3)' };
  if (on && !isDefault) return { text: 'Extra', color: 'var(--green)' };
  if (!on && isDefault) return { text: 'Removed', color: 'var(--red)' };
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

export default function AccessControl({ defaultTab = 'staff' }) {
  usePageTitle('Access Control');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');

  const { user, refreshUser } = useAuth();
  const {
    accessCatalog = [],
    checklistRoles = [],
    roleAccess = {},
    roleLocationAccess = {},
    roleDefaults = {},
    effectiveAccess = [],
    hasFeature,
    refreshTenant,
    loading: tenantLoading,
  } = useTenant();

  const isOwner = user?.role === 'Owner';
  const canManageLocations = isOwner || user?.role === 'General Manager';
  const multiBranches = typeof hasFeature === 'function' && hasFeature('multi_branches');
  const hasStaff = Boolean(
    isOwner ||
    user?.role === 'General Manager' ||
    user?.accessOverrides?.add?.includes('staff') ||
    user?.access?.includes('access_control')
  );

  const canViewRoleDefaults = ['Owner', 'General Manager', 'Sales Manager'].includes(user?.role);

  // Sub-tab selection: 'staff' | 'roles'
  const [activeTab, setActiveTab] = useState(() => {
    if (urlTab === 'roles' || urlTab === 'staff') return urlTab;
    return defaultTab;
  });

  useEffect(() => {
    if (urlTab === 'roles' || urlTab === 'staff') {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (t) => {
    setActiveTab(t);
    setSearchParams({ tab: t }, { replace: true });
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 1: Staff Members & Overrides State
  // ══════════════════════════════════════════════════════════════════════
  const staffFilterRoles = useMemo(() => {
    if (isOwner) {
      return ['General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'];
    }
    if (user?.role === 'General Manager') {
      return ['Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'];
    }
    if (user?.role === 'Sales Manager') {
      return ['Sales', 'Receptionist'];
    }
    if (user?.role === 'Coach Manager') {
      return ['Coach'];
    }
    if (hasStaff) {
      return ['Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'].filter(
        (r) => r !== user?.role && r !== 'General Manager'
      );
    }
    return (ROLE_CHOICES[user?.role] || []).filter((r) => r !== 'General Manager');
  }, [user, hasStaff, isOwner]);

  const [staffRole, setStaffRole] = useState('');
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [groups, setGroups] = useState([]);
  const [staffDraft, setStaffDraft] = useState({});
  const [accessLocations, setAccessLocations] = useState([]);
  const [locationDraft, setLocationDraft] = useState({
    canAccessAllLocations: false,
    allowedLocationIds: [],
  });
  const [savedLocationDraft, setSavedLocationDraft] = useState({
    canAccessAllLocations: false,
    allowedLocationIds: [],
  });
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [catalogLocations, setCatalogLocations] = useState([]);

  useEffect(() => {
    if (!canManageLocations) return undefined;
    let cancelled = false;
    listLocations()
      .then((res) => {
        if (!cancelled) setCatalogLocations(res.data?.locations || []);
      })
      .catch(() => {
        if (!cancelled) setCatalogLocations([]);
      });
    return () => { cancelled = true; };
  }, [canManageLocations]);

  useEffect(() => {
    if (!staffRole) {
      setPeople([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingPeople(true);
    listAccessUsersByRole(staffRole)
      .then((res) => {
        if (!cancelled) setPeople(res.data.users || []);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPeople(false);
      });
    return () => { cancelled = true; };
  }, [staffRole]);

  const chooseUser = async (person) => {
    setSelectedPerson(person);
    if (!canEditFeatureAccess(user, person.role)) {
      setGroups([]);
      setStaffDraft({});
      setAccessLocations([]);
      setLocationDraft({ canAccessAllLocations: false, allowedLocationIds: [] });
      setSavedLocationDraft({ canAccessAllLocations: false, allowedLocationIds: [] });
      setLoadingAccess(false);
      return;
    }
    setLoadingAccess(true);
    try {
      const res = await getUserAccess(person._id);
      const nextGroups = res.data.groups || [];
      setGroups(nextGroups);
      const flags = {};
      nextGroups.forEach((group) => {
        group.features.forEach((feature) => {
          flags[feature.key] = feature.enabled;
        });
      });
      setStaffDraft(flags);
      const locs = (res.data.locations || []).length
        ? res.data.locations
        : catalogLocations;
      setAccessLocations(locs);
      const nextLoc = {
        canAccessAllLocations: Boolean(res.data.user?.canAccessAllLocations),
        allowedLocationIds: (res.data.user?.allowedLocationIds || []).map(String),
      };
      setLocationDraft(nextLoc);
      setSavedLocationDraft(nextLoc);
    } catch (error) {
      setGroups([]);
      setStaffDraft({});
      setAccessLocations([]);
      const blockedFromFeatures = error.response?.status === 403 && canChangeUserRole(user, person.role);
      if (!blockedFromFeatures) {
        toast.error(error.response?.data?.message || 'Could not load access');
      }
    } finally {
      setLoadingAccess(false);
    }
  };

  const savedKeys = useMemo(() => enabledKeys(groups).sort().join('|'), [groups]);
  const draftKeys = useMemo(
    () => Object.entries(staffDraft).filter(([, on]) => on).map(([key]) => key).sort().join('|'),
    [staffDraft],
  );
  const locationDirty = useMemo(() => {
    if (!canManageLocations) return false;
    const a = savedLocationDraft;
    const b = locationDraft;
    if (Boolean(a.canAccessAllLocations) !== Boolean(b.canAccessAllLocations)) return true;
    const sa = [...(a.allowedLocationIds || [])].sort().join('|');
    const sb = [...(b.allowedLocationIds || [])].sort().join('|');
    return sa !== sb;
  }, [canManageLocations, savedLocationDraft, locationDraft]);
  const isStaffDirty = Boolean(selectedPerson) && (savedKeys !== draftKeys || locationDirty);
  const staffLocationList = accessLocations.length ? accessLocations : catalogLocations;
  const showStaffLocationAccess = Boolean(
    canManageLocations
    && selectedPerson
    && selectedPerson.role !== 'Owner'
    && !loadingAccess
  );

  const confirmStaffAccess = async () => {
    if (!selectedPerson || !isStaffDirty) return;
    const features = Object.entries(staffDraft).filter(([, on]) => on).map(([key]) => key);
    setSavingStaff(true);
    try {
      const locationGrants = canManageLocations
        ? {
            canAccessAllLocations: Boolean(locationDraft.canAccessAllLocations),
            allowedLocationIds: locationDraft.canAccessAllLocations
              ? []
              : (locationDraft.allowedLocationIds || []),
          }
        : {};
      const res = await updateUserAccess(selectedPerson._id, features, locationGrants);
      const nextGroups = res.data.groups || [];
      setGroups(nextGroups);
      const flags = {};
      nextGroups.forEach((group) => {
        group.features.forEach((feature) => {
          flags[feature.key] = feature.enabled;
        });
      });
      setStaffDraft(flags);
      if (res.data.locations) setAccessLocations(res.data.locations);
      const nextLoc = {
        canAccessAllLocations: Boolean(res.data.user?.canAccessAllLocations),
        allowedLocationIds: (res.data.user?.allowedLocationIds || []).map(String),
      };
      setLocationDraft(nextLoc);
      setSavedLocationDraft(nextLoc);
      toast.success(`Access updated for ${selectedPerson.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save access');
    } finally {
      setSavingStaff(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 2: Role Defaults State
  // ══════════════════════════════════════════════════════════════════════
  const editableChecklistRoles = useMemo(() => {
    const all = checklistRoles.length
      ? checklistRoles
      : ['General Manager', 'Receptionist', 'Coach', 'Coach Manager', 'Accountant', 'Sales', 'Sales Manager'];
    if (isOwner) return all;
    if (user?.role === 'Sales Manager') {
      return all.filter((r) => ['Sales', 'Receptionist'].includes(r));
    }
    if (user?.role === 'Coach Manager') {
      return all.filter((r) => r === 'Coach');
    }
    if (user?.role === 'General Manager') {
      return all.filter((r) => r !== 'General Manager');
    }
    if (hasStaff) {
      return all.filter((r) => r !== 'General Manager' && r !== user?.role);
    }
    return all.filter((r) => ['Sales', 'Receptionist'].includes(r));
  }, [checklistRoles, isOwner, user?.role, hasStaff]);

  const [defaultRoleChoice, setDefaultRoleChoice] = useState(() => (
    isOwner ? 'General Manager' : user?.role === 'Sales Manager' ? 'Sales' : user?.role === 'Coach Manager' ? 'Coach' : 'Sales'
  ));
  const [roleDraft, setRoleDraft] = useState([]);
  const [roleLocationDraft, setRoleLocationDraft] = useState({
    canAccessAll: true,
    locationIds: [],
  });
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    if (editableChecklistRoles.length > 0 && !editableChecklistRoles.includes(defaultRoleChoice)) {
      setDefaultRoleChoice(editableChecklistRoles[0]);
    }
  }, [editableChecklistRoles, defaultRoleChoice]);

  const savedRoleList = roleAccess && Object.prototype.hasOwnProperty.call(roleAccess, defaultRoleChoice)
    ? roleAccess[defaultRoleChoice]
    : null;
  const roleBase = savedRoleList || roleDefaults[defaultRoleChoice] || [];

  useEffect(() => {
    setRoleDraft(Array.isArray(roleBase) ? [...roleBase] : []);
  }, [defaultRoleChoice, roleAccess, roleDefaults]);

  useEffect(() => {
    const saved = roleLocationAccess?.[defaultRoleChoice];
    if (!Array.isArray(saved) || saved.length === 0) {
      setRoleLocationDraft({ canAccessAll: true, locationIds: [] });
    } else {
      setRoleLocationDraft({
        canAccessAll: false,
        locationIds: saved.map(String),
      });
    }
  }, [defaultRoleChoice, roleLocationAccess]);

  const actorAreas = useMemo(() => new Set(effectiveAccess || []), [effectiveAccess]);
  const isReadOnlyRole = !isOwner && (
    defaultRoleChoice === 'General Manager' ||
    (user?.role === 'Sales Manager' && !['Sales', 'Receptionist'].includes(defaultRoleChoice)) ||
    (user?.role === 'Coach Manager' && defaultRoleChoice !== 'Coach')
  );

  function planLocked(area) {
    return Boolean(area.planFeature) && typeof hasFeature === 'function' && !hasFeature(area.planFeature);
  }

  function rowLocked(area) {
    if (isReadOnlyRole) return true;
    if (planLocked(area)) return true;
    if (!isOwner && !actorAreas.has(area.key)) return true;
    return false;
  }

  function toggleRoleArea(area) {
    if (rowLocked(area)) return;
    setRoleDraft((prev) => (
      prev.includes(area.key) ? prev.filter((key) => key !== area.key) : [...prev, area.key]
    ));
  }

  async function saveRoleDefaults() {
    setSavingRole(true);
    try {
      const areas = roleDraft.filter((key) => {
        const area = accessCatalog.find((item) => item.key === key);
        return area && !planLocked(area);
      });
      const locationIds = canManageLocations
        ? (roleLocationDraft.canAccessAll ? [] : roleLocationDraft.locationIds)
        : undefined;
      await updateRoleAccess(defaultRoleChoice, areas, locationIds);
      toast.success(`Access updated for ${defaultRoleChoice}`);
      if (typeof refreshTenant === 'function') await refreshTenant();
      if (typeof refreshUser === 'function') refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save access');
    } finally {
      setSavingRole(false);
    }
  }

  return (
    <Layout>
      <PageHeader walkthrough="access-header" title="Access Control" />

      <div className="page-wrap" data-walkthrough="access-board" style={{ paddingTop: 20, paddingBottom: 96, maxWidth: 840 }}>

        {/* ── Sub-tabs Header ────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          gap: 6,
          marginBottom: 20,
        }}>
          <button
            type="button"
            onClick={() => handleTabChange('staff')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === 'staff' ? 'var(--navy)' : 'transparent'}`,
              marginBottom: -1,
              color: activeTab === 'staff' ? 'var(--navy)' : 'var(--t3)',
              fontSize: 13,
              fontWeight: activeTab === 'staff' ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}
          >
            <User size={16} aria-hidden="true" />
            <span>Staff Members & Roles</span>
          </button>

          {canViewRoleDefaults && (
            <button
              type="button"
              onClick={() => handleTabChange('roles')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === 'roles' ? 'var(--navy)' : 'transparent'}`,
                marginBottom: -1,
                color: activeTab === 'roles' ? 'var(--navy)' : 'var(--t3)',
                fontSize: 13,
                fontWeight: activeTab === 'roles' ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              <Shield size={16} aria-hidden="true" />
              <span>Role Defaults</span>
            </button>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1: STAFF MEMBERS & OVERRIDES
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'staff' && (
          <div data-walkthrough="access-staff" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Step 1: Staff Picker */}
            <Card>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
                Choose a Staff Member
              </h3>
              <p style={{ fontSize: 12, color: 'var(--t4)', margin: '0 0 14px' }}>
                Select a staff member to view their access, promote/change their role, or customize individual feature overrides.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
                  Current Role
                  <select
                    value={staffRole}
                    aria-label="Filter role"
                    onChange={(event) => {
                      setStaffRole(event.target.value);
                      setSelectedPerson(null);
                      setGroups([]);
                      setStaffDraft({});
                    }}
                    style={{
                      padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                    }}
                  >
                    <option value="">Choose a role</option>
                    {staffFilterRoles.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 240px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
                  Staff Member
                  <select
                    value={selectedPerson?._id || ''}
                    aria-label="Staff member"
                    disabled={!staffRole || loadingPeople}
                    onChange={(event) => {
                      const person = people.find((item) => item._id === event.target.value);
                      if (person) chooseUser(person);
                    }}
                    style={{
                      padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                    }}
                  >
                    <option value="">{loadingPeople ? 'Loading staff…' : 'Choose a person'}</option>
                    {people.map((person) => (
                      <option key={person._id} value={person._id}>{person.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </Card>

            {/* Step 2: Staff Member Profile & Role Changer Card */}
            {selectedPerson && (
              <div style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={selectedPerson.name} size="md" />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{selectedPerson.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{selectedPerson.email || 'No email registered'}</span>
                        {selectedPerson.mobile_number && <span>· {selectedPerson.mobile_number}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 600 }}>Role:</span>
                    <Badge status="active">{selectedPerson.role}</Badge>
                  </div>
                </div>

                {canChangeUserRole(user, selectedPerson.role) && (
                  <div style={{
                    paddingTop: 14,
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Change Assigned Role</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                        Promote or change this staff member’s role. Their baseline privileges will update automatically.
                      </div>
                    </div>
                    <ChangeRoleField
                      userId={selectedPerson._id}
                      currentRole={selectedPerson.role}
                      label="New Role"
                      onChanged={async (newRole) => {
                        const person = { ...selectedPerson, role: newRole };
                        setSelectedPerson(person);
                        if (newRole !== staffRole) setStaffRole(newRole);
                        await chooseUser(person);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {loadingAccess && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
            )}

            {!loadingAccess && selectedPerson && groups.length === 0 && !hasStaff && user?.role === 'Sales Manager' && canChangeUserRole(user, selectedPerson.role) && (
              <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>
                You can change this person’s role above. Feature overrides for this person are managed by an owner or general manager.
              </p>
            )}

            {/* Step 3: Branch viewing + feature overrides */}
            {showStaffLocationAccess && groups.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                <LocationAccessEditor
                  description={
                    multiBranches
                      ? `Choose which branches ${selectedPerson.name} can view in the navbar and data screens.`
                      : `Choose which branches ${selectedPerson.name} can view. Multi-branch viewing is most useful on Gold/Platinum.`
                  }
                  locations={staffLocationList}
                  canAccessAll={Boolean(locationDraft.canAccessAllLocations)}
                  onCanAccessAllChange={(checked) => setLocationDraft((prev) => ({
                    ...prev,
                    canAccessAllLocations: checked,
                    allowedLocationIds: checked ? [] : prev.allowedLocationIds,
                  }))}
                  selectedIds={locationDraft.allowedLocationIds}
                  onToggleId={(id, checked) => {
                    setLocationDraft((prev) => {
                      const set = new Set(prev.allowedLocationIds);
                      if (checked) set.add(id);
                      else set.delete(id);
                      return { ...prev, allowedLocationIds: [...set] };
                    });
                  }}
                />
                <div style={{
                  position: 'sticky', bottom: 16, zIndex: 5,
                  display: 'flex', justifyContent: 'flex-end', gap: 10,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                }}>
                  <Btn
                    variant="ghost"
                    disabled={!locationDirty || savingStaff}
                    onClick={() => setLocationDraft(savedLocationDraft)}
                  >
                    Reset
                  </Btn>
                  <Btn disabled={!isStaffDirty || savingStaff} onClick={confirmStaffAccess}>
                    {savingStaff ? <Spinner size="sm" /> : 'Confirm Access'}
                  </Btn>
                </div>
              </div>
            )}

            {!loadingAccess && selectedPerson && groups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
                  Feature overrides for <strong>{selectedPerson.name}</strong> ({selectedPerson.role}). Role defaults remain active unless individually toggled.
                </p>

                {showStaffLocationAccess && (
                  <LocationAccessEditor
                    description={
                      multiBranches
                        ? 'Choose which branches this person can view in the navbar and data screens.'
                        : 'Choose which branches this person can view. Multi-branch viewing is most useful on Gold/Platinum.'
                    }
                    locations={staffLocationList}
                    canAccessAll={Boolean(locationDraft.canAccessAllLocations)}
                    onCanAccessAllChange={(checked) => setLocationDraft((prev) => ({
                      ...prev,
                      canAccessAllLocations: checked,
                      allowedLocationIds: checked ? [] : prev.allowedLocationIds,
                    }))}
                    selectedIds={locationDraft.allowedLocationIds}
                    onToggleId={(id, checked) => {
                      setLocationDraft((prev) => {
                        const set = new Set(prev.allowedLocationIds);
                        if (checked) set.add(id);
                        else set.delete(id);
                        return { ...prev, allowedLocationIds: [...set] };
                      });
                    }}
                  />
                )}

                {groups.map((group) => (
                  <Card key={group.role}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>
                      {group.role}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {group.features.map((feature) => {
                        const on = Boolean(staffDraft[feature.key]);
                        const label = draftBadge(feature, on);
                        return (
                          <div key={feature.key} style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            background: 'var(--card)', padding: '14px 16px',
                            opacity: feature.locked ? 0.72 : 1,
                          }}>
                            <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                              <FeatureIcon name={feature.icon} size={20} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{feature.label}</span>
                                {label && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: label.color, letterSpacing: '0.3px' }}>{label.text}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--t4)' }}>{feature.description}</div>
                              {feature.locked && feature.lockReason && (
                                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{feature.lockReason}</div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--green)' : 'var(--red)' }}>
                                {on ? 'Enabled' : 'Disabled'}
                              </span>
                              <Toggle
                                checked={on}
                                disabled={feature.locked}
                                onChange={(value) => setStaffDraft((prev) => ({ ...prev, [feature.key]: value }))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}

                {/* Sticky Action Footer */}
                <div style={{
                  position: 'sticky', bottom: 16, zIndex: 5,
                  display: 'flex', justifyContent: 'flex-end', gap: 10,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                }}>
                  <Btn
                    variant="ghost"
                    disabled={!isStaffDirty || savingStaff}
                    onClick={() => {
                      const flags = {};
                      groups.forEach((group) => group.features.forEach((feature) => { flags[feature.key] = feature.enabled; }));
                      setStaffDraft(flags);
                      setLocationDraft(savedLocationDraft);
                    }}
                  >
                    Reset Overrides
                  </Btn>
                  <Btn disabled={!isStaffDirty || savingStaff} onClick={confirmStaffAccess}>
                    {savingStaff ? <Spinner size="sm" /> : 'Confirm Access'}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 2: ROLE DEFAULTS
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'roles' && canViewRoleDefaults && (
          <div data-walkthrough="access-roles" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tenantLoading && !accessCatalog.length ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="lg" /></div>
            ) : (
              <Card>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>
                    Select Role to Configure
                  </label>
                  <select
                    value={defaultRoleChoice}
                    onChange={(event) => setDefaultRoleChoice(event.target.value)}
                    style={{
                      width: '100%', maxWidth: 320,
                      padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--card)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
                    }}
                  >
                    {editableChecklistRoles.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--t3)', lineHeight: 1.5,
                }}>
                  {isReadOnlyRole ? (
                    <span style={{ color: 'var(--amber)' }}>Only the owner can modify the General Manager baseline permissions.</span>
                  ) : !savedRoleList ? (
                    <span>This role is currently using factory defaults. Modifying and saving will establish your gym’s custom baseline for this role.</span>
                  ) : (
                    <span>Changes to this checklist apply automatically to all staff in the <strong>{defaultRoleChoice}</strong> role who do not have custom overrides.</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {accessCatalog.map((area) => {
                    const on = roleDraft.includes(area.key) && !planLocked(area);
                    const disabled = rowLocked(area);
                    return (
                      <div key={area.key} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--card)',
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{area.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                            {planLocked(area) ? 'Not included in this gym’s plan' : area.description}
                            {!isOwner && !actorAreas.has(area.key) && !planLocked(area) ? ' · You do not possess this privilege' : ''}
                          </div>
                        </div>
                        <Toggle checked={on} disabled={disabled} onChange={() => toggleRoleArea(area)} />
                      </div>
                    );
                  })}
                </div>

                {canManageLocations && (
                  <div style={{ marginTop: 20 }}>
                    <LocationAccessEditor
                      title={`Default branch viewing · ${defaultRoleChoice}`}
                      description="Staff in this role inherit these branch permissions unless they have personal overrides on the Staff Members tab. Empty / All locations means no branch restriction."
                      locations={catalogLocations}
                      canAccessAll={Boolean(roleLocationDraft.canAccessAll)}
                      onCanAccessAllChange={(checked) => setRoleLocationDraft({
                        canAccessAll: checked,
                        locationIds: checked ? [] : roleLocationDraft.locationIds,
                      })}
                      selectedIds={roleLocationDraft.locationIds}
                      onToggleId={(id, checked) => {
                        setRoleLocationDraft((prev) => {
                          const set = new Set(prev.locationIds);
                          if (checked) set.add(id);
                          else set.delete(id);
                          return { canAccessAll: false, locationIds: [...set] };
                        });
                      }}
                      allMeansNoRestriction
                      disabled={isReadOnlyRole || !hasStaff}
                    />
                  </div>
                )}

                <div style={{ marginTop: 20 }}>
                  <Btn onClick={saveRoleDefaults} disabled={savingRole || !hasStaff || isReadOnlyRole}>
                    {savingRole ? <Spinner size="sm" /> : 'Save Role Defaults'}
                  </Btn>
                </div>
              </Card>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
