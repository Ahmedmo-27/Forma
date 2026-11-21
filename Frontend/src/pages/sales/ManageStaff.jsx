import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Input, Select, Btn, Spinner } from '../../components/ui';
import LocationAccessEditor from '../../components/LocationAccessEditor';
import { createStaffUser, listLocations } from '../../api/endpoints';
import { isValidEmail, isValidPhone } from '../../lib/validation';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useLocationScope, ALL_LOCATIONS } from '../../context/LocationContext';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';
import UsernameField, { validateUsernameClient } from '../../components/UsernameField';

const ALL_STAFF_ROLES = [
  ['General Manager', tr('General Manager')],
  ['Sales Manager', tr('Sales Manager')],
  ['Sales', tr('Sales Representative')],
  ['Head Coach', tr('Head Coach')],
  ['Coach', tr('Coach')],
  ['Receptionist', tr('Receptionist')],
  ['Accountant', tr('Accountant')],
];

const CREATABLE_ROLES = {
  Owner: ALL_STAFF_ROLES,
  'General Manager': ALL_STAFF_ROLES.filter(([role]) => role !== 'General Manager'),
  'Sales Manager': [
    ['Sales', tr('Sales Representative')],
    ['Receptionist', tr('Receptionist')],
  ],
  'Head Coach': [
    ['Coach', tr('Coach')],
  ],
};

const INIT = {
  name: '',
  email: '',
  username: '',
  mobile_number: '',
  password: '',
  role: 'Sales',
  canAccessAllLocations: false,
  allowedLocationIds: [],
};

export default function ManageStaff() {
  const { t } = useI18n();
  usePageTitle(t('Manage Staff'));
  const { user } = useAuth();
  const { hasFeature, tenant } = useTenant() || {};
  const { selectedLocationId } = useLocationScope();
  const effectiveRoles = tenant?.effectiveRoles;
  const roleOptions = useMemo(() => {
    const creatable = CREATABLE_ROLES[user?.role] || [];
    if (!Array.isArray(effectiveRoles)) return creatable;
    return creatable.filter(([role]) => effectiveRoles.includes(role));
  }, [user?.role, effectiveRoles]);
  const canSetLocations = ['Owner', 'General Manager'].includes(user?.role)
    && Boolean(hasFeature?.('multi_branches'));
  const deskBranch =
    selectedLocationId && selectedLocationId !== ALL_LOCATIONS
      ? String(selectedLocationId)
      : '';

  const [form, setForm] = useState(() => ({
    ...INIT,
    role: roleOptions[0]?.[0] || 'Sales',
    canAccessAllLocations: roleOptions[0]?.[0] === 'General Manager',
    allowedLocationIds: deskBranch ? [deskBranch] : [],
  }));
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [usernameStatus, setUsernameStatus] = useState('idle');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!canSetLocations) return undefined;
    let cancelled = false;
    listLocations()
      .then((res) => {
        if (!cancelled) setLocations(res.data?.locations || []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => { cancelled = true; };
  }, [canSetLocations]);

  // Prefill branch grants from the navbar selection (without wiping a manual multi-select)
  useEffect(() => {
    if (!canSetLocations || !deskBranch) return;
    setForm((f) => {
      if (f.canAccessAllLocations || f.role === 'General Manager') return f;
      if ((f.allowedLocationIds || []).length > 1) return f;
      if ((f.allowedLocationIds || [])[0] === deskBranch) return f;
      return { ...f, allowedLocationIds: [deskBranch] };
    });
  }, [canSetLocations, deskBranch]);

  useEffect(() => {
    if (!roleOptions.length) return;
    if (roleOptions.some(([role]) => role === form.role)) return;
    setForm((current) => ({
      ...current,
      role: roleOptions[0][0],
      canAccessAllLocations: roleOptions[0][0] === 'General Manager',
    }));
  }, [roleOptions, form.role]);

  const validate = () => {
    const e = {};
    const nameTrim = form.name.trim();
    const emailTrim = form.email.trim();
    const mobileTrim = form.mobile_number.trim();

    if (!nameTrim) {
      e.name = t('Name is required');
    } else if (nameTrim.length > 120) {
      e.name = t('Name must not exceed 120 characters');
    }

    if (!emailTrim) {
      e.email = t('Email is required');
    } else if (!isValidEmail(emailTrim)) {
      e.email = t('Enter a valid email address');
    }

    if (!mobileTrim) {
      e.mobile_number = t('Mobile number is required');
    } else if (!isValidPhone(mobileTrim)) {
      e.mobile_number = t('Enter a valid mobile phone number (5–40 characters)');
    }

    if (!form.password) {
      e.password = t('Password is required');
    } else if (form.password.length < 8) {
      e.password = t('Password must be at least 8 characters');
    } else if (form.password.length > 200) {
      e.password = t('Password must not exceed 200 characters');
    }

    const usernameError = validateUsernameClient(form.username, t);
    if (usernameError) e.username = usernameError;
    else if (form.username.trim() && (usernameStatus === 'taken' || usernameStatus === 'checking')) {
      e.username = usernameStatus === 'taken'
        ? t('This username is already taken')
        : t('Checking availability…');
    }

    if (!roleOptions.some(([role]) => role === form.role)) {
      e.role = t('Please select a valid staff role');
    }

    if (
      canSetLocations
      && !form.canAccessAllLocations
      && !(form.allowedLocationIds || []).length
    ) {
      e.allowedLocationIds = t('Select at least one branch, or enable all locations');
    }

    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        mobile_number: form.mobile_number.trim(),
        password: form.password,
        role: form.role,
      };
      if (form.username.trim()) payload.username = form.username.trim().toLowerCase();
      if (canSetLocations) {
        payload.canAccessAllLocations = Boolean(form.canAccessAllLocations);
        payload.allowedLocationIds = form.canAccessAllLocations
          ? []
          : (form.allowedLocationIds || []);
      }
      const res = await createStaffUser(payload);
      const username = res?.data?.user?.username;
      toast.success(
        `${t('{role} account created!', { role: t(form.role) })}${username ? ` ${t('Username')}: ${username}` : ''}`
      );
      setForm({
        ...INIT,
        role: roleOptions[0]?.[0] || 'Sales',
        canAccessAllLocations: roleOptions[0]?.[0] === 'General Manager',
        allowedLocationIds: deskBranch ? [deskBranch] : [],
      });
      setErrors({});
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || t('Failed to create account.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <PageHeader walkthrough="staff-header" title={t('Manage Staff')} subtitle={t('Create a staff account for any role on the platform')} />

      <div className="page-wrap" data-walkthrough="staff-board" style={{ paddingTop: 20, paddingBottom: 32, maxWidth: 480 }}>
        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label={t('Full Name *')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
            />
            <Input
              label={t('Email *')}
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <UsernameField
              value={form.username}
              onChange={(v) => set('username', v)}
              error={errors.username}
              onAvailabilityChange={setUsernameStatus}
            />
            <Input
              label={t('Mobile Number *')}
              value={form.mobile_number}
              onChange={(e) => set('mobile_number', e.target.value)}
              error={errors.mobile_number}
              placeholder={t('e.g. 01012345678')}
              dir="ltr"
            />
            <Input
              label={t('Password *')}
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              error={errors.password}
            />
            <Select
              label={t('Role *')}
              value={form.role}
              onChange={(e) => {
                const role = e.target.value;
                setForm((f) => ({
                  ...f,
                  role,
                  canAccessAllLocations: role === 'General Manager' ? true : f.canAccessAllLocations,
                  allowedLocationIds: role === 'General Manager' ? [] : f.allowedLocationIds,
                }));
              }}
            >
              {roleOptions.map(([value, label]) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </Select>

            {canSetLocations && (
              <LocationAccessEditor
                embedded
                title={t('Branch viewing access')}
                description={t('Choose whether this user can view data for all branches or only selected ones.')}
                locations={locations}
                canAccessAll={Boolean(form.canAccessAllLocations)}
                onCanAccessAllChange={(checked) => setForm((f) => ({
                  ...f,
                  canAccessAllLocations: checked,
                  allowedLocationIds: checked ? [] : f.allowedLocationIds,
                }))}
                selectedIds={form.allowedLocationIds}
                onToggleId={(id, checked) => setForm((f) => {
                  const setIds = new Set(f.allowedLocationIds || []);
                  if (checked) setIds.add(id);
                  else setIds.delete(id);
                  return { ...f, canAccessAllLocations: false, allowedLocationIds: [...setIds] };
                })}
                error={errors.allowedLocationIds}
              />
            )}

            <div style={{ paddingTop: 4 }}>
              <Btn type="submit" disabled={loading}>
                {loading ? <Spinner size="sm" /> : t('Create Account')}
              </Btn>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
