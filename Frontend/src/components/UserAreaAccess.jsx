import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, Btn } from './ui';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { updateUserAreaAccess } from '../api/endpoints';

export default function UserAreaAccess({ target }) {
  const { user } = useAuth();
  const { accessCatalog, roleAccess, roleDefaults, effectiveAccess, hasFeature } = useTenant();
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const isOwner = user?.role === 'Owner';
  const blocked = !target
    || target.role === 'Owner'
    || (user?.role === 'General Manager' && target.role === 'General Manager')
    || (user?.role !== 'Owner' && user?.role !== 'General Manager');

  const savedRole = roleAccess && Object.prototype.hasOwnProperty.call(roleAccess, target?.role)
    ? roleAccess[target.role]
    : null;
  const base = savedRole || roleDefaults[target?.role] || [];
  const add = new Set(target?.accessOverrides?.add || []);
  const remove = new Set(target?.accessOverrides?.remove || []);

  useEffect(() => {
    const next = new Set(base);
    add.forEach((key) => next.add(key));
    remove.forEach((key) => next.delete(key));
    setDraft([...next]);
  }, [target?._id, target?.role, roleAccess, roleDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  if (blocked || !accessCatalog.length) return null;

  const actorAreas = new Set(effectiveAccess || []);

  function planLocked(area) {
    return Boolean(area.planFeature) && !hasFeature(area.planFeature);
  }

  function toggle(area) {
    if (planLocked(area)) return;
    if (!isOwner && !actorAreas.has(area.key)) return;
    setDraft((prev) => (
      prev.includes(area.key) ? prev.filter((key) => key !== area.key) : [...prev, area.key]
    ));
  }

  async function save() {
    const selected = new Set(draft);
    const nextAdd = [...selected].filter((key) => !base.includes(key));
    const nextRemove = base.filter((key) => !selected.has(key));
    setSaving(true);
    try {
      await updateUserAreaAccess(target._id, nextAdd, nextRemove);
      toast.success('Personal access updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save access');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Area access</div>
      <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 0 }}>
        These boxes change this person only. Their role checklist stays the same for everyone else.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accessCatalog.map((area) => {
          const on = draft.includes(area.key) && !planLocked(area);
          const disabled = planLocked(area) || (!isOwner && !actorAreas.has(area.key));
          return (
            <label key={area.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t1)' }}>
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(area)}
              />
              <span>{area.label}</span>
              {planLocked(area) && <span style={{ color: 'var(--t3)' }}>Not in plan</span>}
            </label>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        <Btn size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save personal access'}</Btn>
      </div>
    </Card>
  );
}
