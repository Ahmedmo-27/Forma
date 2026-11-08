import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Btn, Spinner } from './ui';
import { useAuth } from '../context/AuthContext';
import { changeUserRole } from '../api/endpoints';
import { hasAccess } from '../lib/access';
import { canChangeUserRole, roleChoicesFor } from '../lib/roles';

const fieldStyle = {
  padding: '10px 12px', borderRadius: 8, flex: '1 1 160px', minWidth: 0,
  border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit',
};

export default function ChangeRoleField({ userId, currentRole, onChanged, label = 'Role' }) {
  const { user } = useAuth();
  const [nextRole, setNextRole] = useState(currentRole || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNextRole(currentRole || '');
  }, [userId, currentRole]);

  const allowed = hasAccess(user, 'change_role') && canChangeUserRole(user?.role, currentRole);
  const choices = roleChoicesFor(user?.role, currentRole);

  if (!allowed || !userId) return null;

  async function save() {
    if (!nextRole || nextRole === currentRole) return;
    setSaving(true);
    try {
      await changeUserRole(userId, nextRole);
      toast.success(`Role changed to ${nextRole}`);
      onChanged?.(nextRole);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not change role');
    } finally {
      setSaving(false);
    }
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 240px', fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
      {label}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          aria-label={label}
          value={nextRole}
          disabled={saving}
          onChange={(event) => setNextRole(event.target.value)}
          style={fieldStyle}
        >
          {choices.map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <Btn size="sm" disabled={saving || !nextRole || nextRole === currentRole} onClick={save}>
          {saving ? <Spinner size="sm" /> : 'Save role'}
        </Btn>
      </div>
    </label>
  );
}
