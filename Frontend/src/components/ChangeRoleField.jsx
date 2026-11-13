import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Btn, Spinner, MenuSelect } from './ui';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { changeUserRole } from '../api/endpoints';
import { hasAccess } from '../lib/access';
import { canChangeUserRole, roleChoicesFor } from '../lib/roles';

export default function ChangeRoleField({ userId, currentRole, onChanged, label = 'Role' }) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [nextRole, setNextRole] = useState(currentRole || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNextRole(currentRole || '');
  }, [userId, currentRole]);

  const allowed = hasAccess(user, 'change_role') && canChangeUserRole(user?.role, currentRole);
  const choices = roleChoicesFor(user?.role, currentRole, tenant?.effectiveRoles);

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
        <MenuSelect
          aria-label={label}
          value={nextRole}
          disabled={saving}
          onChange={(event) => setNextRole(event.target.value)}
          style={{ flex: '1 1 160px', minWidth: 0 }}
          options={choices.map((role) => ({ value: role, label: role }))}
        />
        <Btn size="sm" disabled={saving || !nextRole || nextRole === currentRole} onClick={save}>
          {saving ? <Spinner size="sm" /> : 'Save role'}
        </Btn>
      </div>
    </label>
  );
}
