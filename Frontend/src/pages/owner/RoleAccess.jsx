import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { listAccessUsersByRole, updateRoleAccess } from '../../api/endpoints';
import ChangeRoleField from '../../components/ChangeRoleField';

const PERSON_ROLES = {
  Owner: ['Owner', 'General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
  'General Manager': ['Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'],
};

function StaffRoleCard() {
  const { user } = useAuth();
  const roles = PERSON_ROLES[user?.role] || [];
  const [role, setRole] = useState('');
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!role) {
      setPeople([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingPeople(true);
    listAccessUsersByRole(role)
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
  }, [role]);

  if (!roles.length) return null;

  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
        Change a staff member’s role
      </h3>
      <p style={{ fontSize: 12, color: 'var(--t4)', marginTop: 0, marginBottom: 14 }}>
        This changes one person. The checklist below still applies to the whole role.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 180px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
          Current role
          <select
            aria-label="Current role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setSelected(null);
            }}
            style={{
              padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
            }}
          >
            <option value="">Choose a role</option>
            {roles.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
          Staff member
          <select
            aria-label="Staff member"
            value={selected?._id || ''}
            disabled={!role || loadingPeople}
            onChange={(event) => {
              const person = people.find((item) => item._id === event.target.value);
              setSelected(person || null);
            }}
            style={{
              padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
            }}
          >
            <option value="">{loadingPeople ? 'Loading…' : 'Choose a person'}</option>
            {people.map((person) => (
              <option key={person._id} value={person._id}>{person.name}</option>
            ))}
          </select>
        </label>
        {selected && (
          <ChangeRoleField
            userId={selected._id}
            currentRole={selected.role}
            label="New role"
            onChanged={(newRole) => {
              setSelected((prev) => (prev ? { ...prev, role: newRole } : prev));
              setRole(newRole);
            }}
          />
        )}
      </div>
    </Card>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        border: 'none', padding: 0, flexShrink: 0,
        background: checked ? 'var(--blue)' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }} />
    </button>
  );
}

export default function RoleAccess() {
  usePageTitle('Role access');
  const { user, refreshUser } = useAuth();
  const {
    accessCatalog,
    checklistRoles,
    roleAccess,
    roleDefaults,
    effectiveAccess,
    hasFeature,
    refreshTenant,
    loading,
  } = useTenant();

  const isOwner = user?.role === 'Owner';
  const [role, setRole] = useState('General Manager');
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const savedList = roleAccess && Object.prototype.hasOwnProperty.call(roleAccess, role)
    ? roleAccess[role]
    : null;
  const base = savedList || roleDefaults[role] || [];

  useEffect(() => {
    setDraft(Array.isArray(base) ? [...base] : []);
  }, [role, roleAccess, roleDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  const actorAreas = useMemo(() => new Set(effectiveAccess || []), [effectiveAccess]);
  const readOnlyRole = !isOwner && role === 'General Manager';

  function planLocked(area) {
    return Boolean(area.planFeature) && !hasFeature(area.planFeature);
  }

  function rowLocked(area) {
    if (readOnlyRole) return true;
    if (planLocked(area)) return true;
    if (!isOwner && !actorAreas.has(area.key)) return true;
    return false;
  }

  function toggle(area) {
    if (rowLocked(area)) return;
    setDraft((prev) => (
      prev.includes(area.key) ? prev.filter((key) => key !== area.key) : [...prev, area.key]
    ));
  }

  async function save() {
    setSaving(true);
    try {
      const areas = draft.filter((key) => {
        const area = accessCatalog.find((item) => item.key === key);
        return area && !planLocked(area);
      });
      await updateRoleAccess(role, areas);
      toast.success(`Access updated for ${role}`);
      await refreshTenant();
      refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save access');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <PageHeader title="Role access" />
      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40, maxWidth: 760 }}>
        <StaffRoleCard />
        {loading && !accessCatalog.length ? (
          <Spinner />
        ) : (
          <Card>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>
              Role
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              style={{
                width: '100%', maxWidth: 320, marginBottom: 16,
                padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--card)', color: 'var(--t1)', fontFamily: 'inherit',
              }}
            >
              {(checklistRoles.length ? checklistRoles : ['General Manager']).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {readOnlyRole && (
              <p style={{ fontSize: 13, color: 'var(--t2)', marginTop: 0 }}>
                Only the owner can change the General Manager checklist.
              </p>
            )}
            {!savedList && (
              <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0 }}>
                This role still uses its original access. Saving replaces it with the boxes you leave on.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {accessCatalog.map((area) => {
                const on = draft.includes(area.key) && !planLocked(area);
                const disabled = rowLocked(area);
                return (
                  <div key={area.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{area.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                        {planLocked(area) ? 'Not included in this gym’s plan' : area.description}
                        {!isOwner && !actorAreas.has(area.key) && !planLocked(area) ? ' · You do not have this area' : ''}
                      </div>
                    </div>
                    <Toggle checked={on} disabled={disabled} onChange={() => toggle(area)} />
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 18 }}>
              <Btn onClick={save} disabled={saving || readOnlyRole}>
                {saving ? 'Saving…' : 'Save access'}
              </Btn>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
