import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { listAccessUsersByRole, getUserAccess, updateUserAccess } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import ChangeRoleField from '../../components/ChangeRoleField';
import { canChangeUserRole } from '../../lib/roles';

const ALL_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Sales', 'Coach Manager', 'Coach', 'Receptionist', 'Accountant'];

function canEditFeatureAccess(actorRole, targetRole) {
  if (actorRole === 'Owner') return true;
  if (actorRole === 'General Manager') return targetRole !== 'Owner' && targetRole !== 'General Manager';
  if (actorRole === 'Sales Manager') return targetRole === 'Sales' || targetRole === 'Receptionist';
  if (actorRole === 'Coach Manager') return targetRole === 'Coach';
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
        background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
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

export default function AccessControl() {
  usePageTitle('Access Control');
  const { user } = useAuth();
  const roles = ROLE_CHOICES[user?.role] || [];
  const [role, setRole] = useState('');
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [selected, setSelected] = useState(null);
  const [groups, setGroups] = useState([]);
  const [draft, setDraft] = useState({});
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const chooseUser = async (person) => {
    setSelected(person);
    if (!canEditFeatureAccess(user?.role, person.role)) {
      setGroups([]);
      setDraft({});
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
      setDraft(flags);
    } catch (error) {
      setGroups([]);
      setDraft({});
      const blockedFromFeatures = error.response?.status === 403 && canChangeUserRole(user?.role, person.role);
      if (!blockedFromFeatures) {
        toast.error(error.response?.data?.message || 'Could not load access');
      }
    } finally {
      setLoadingAccess(false);
    }
  };

  const savedKeys = useMemo(() => enabledKeys(groups).sort().join('|'), [groups]);
  const draftKeys = useMemo(
    () => Object.entries(draft).filter(([, on]) => on).map(([key]) => key).sort().join('|'),
    [draft],
  );
  const dirty = Boolean(selected) && savedKeys !== draftKeys;

  const confirm = async () => {
    if (!selected || !dirty) return;
    const features = Object.entries(draft).filter(([, on]) => on).map(([key]) => key);
    setSaving(true);
    try {
      const res = await updateUserAccess(selected._id, features);
      const nextGroups = res.data.groups || [];
      setGroups(nextGroups);
      const flags = {};
      nextGroups.forEach((group) => {
        group.features.forEach((feature) => {
          flags[feature.key] = feature.enabled;
        });
      });
      setDraft(flags);
      toast.success(`Access updated for ${selected.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save access');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader title="Access Control" />
      <div className="page-wrap" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
            Choose a staff member
          </h3>
          <p style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 14 }}>
            Filter by role, then choose the person.
            {['Owner', 'General Manager', 'Sales Manager'].includes(user?.role) && ' You can also change that person’s role.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', maxWidth: 960 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
              Role
              <select
                value={role}
                aria-label="Role"
                onChange={(event) => {
                  setRole(event.target.value);
                  setSelected(null);
                  setGroups([]);
                  setDraft({});
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 240px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
              Staff member
              <select
                value={selected?._id || ''}
                aria-label="Staff member"
                disabled={!role || loadingPeople}
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
                <option value="">{loadingPeople ? 'Loading…' : 'Choose a person'}</option>
                {people.map((person) => (
                  <option key={person._id} value={person._id}>{person.name}</option>
                ))}
              </select>
            </label>
            {selected && canChangeUserRole(user?.role, selected.role) && (
              <ChangeRoleField
                userId={selected._id}
                currentRole={selected.role}
                label="Change role"
                onChanged={async (newRole) => {
                  const person = { ...selected, role: newRole };
                  setSelected(person);
                  if (newRole !== role) setRole(newRole);
                  await chooseUser(person);
                }}
              />
            )}
          </div>
        </Card>

        {loadingAccess && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
        )}

        {!loadingAccess && selected && groups.length === 0 && user?.role === 'Sales Manager' && canChangeUserRole(user.role, selected.role) && (
          <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 18 }}>
            You can change this person’s role. Feature access for this person is managed by an owner or general manager.
          </p>
        )}

        {!loadingAccess && selected && groups.length > 0 && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
              Features for <strong>{selected.name}</strong> ({selected.role}). Defaults stay on until you change them. Confirm at the bottom to save.
            </p>
            {groups.map((group) => (
              <Card key={group.role}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>
                  {group.role}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {group.features.map((feature) => {
                    const on = Boolean(draft[feature.key]);
                    const label = draftBadge(feature, on);
                    return (
                      <div key={feature.key} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        background: 'var(--card)', padding: '14px 16px',
                        opacity: feature.locked ? 0.72 : 1,
                      }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{feature.icon}</span>
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
                            onChange={(value) => setDraft((prev) => ({ ...prev, [feature.key]: value }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            <div style={{
              position: 'sticky', bottom: 16, zIndex: 5,
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '12px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}>
              <Btn
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => {
                  const flags = {};
                  groups.forEach((group) => group.features.forEach((feature) => { flags[feature.key] = feature.enabled; }));
                  setDraft(flags);
                }}
              >
                Reset
              </Btn>
              <Btn disabled={!dirty || saving} onClick={confirm}>
                {saving ? <Spinner size="sm" /> : 'Confirm access'}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
