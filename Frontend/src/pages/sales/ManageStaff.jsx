import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Input, Select, Btn, Spinner } from '../../components/ui';
import LocationAccessEditor from '../../components/LocationAccessEditor';
import StaffIdentityRequestModal from '../../components/StaffIdentityRequestModal';
import { createStaffUser, createStaffIdentityRequest, listLocations } from '../../api/endpoints';
import { isValidEmail, isValidPhone, getPasswordStrengthError } from '../../lib/validation';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useLocationScope, ALL_LOCATIONS } from '../../context/LocationContext';
import { useI18n } from '../../i18n/useI18n';
import UsernameField, { validateUsernameClient } from '../../components/UsernameField';
import { creatableRolesFor, ROLE_LABELS } from '../../lib/roles';

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
  const roleOptions = useMemo(
    () => creatableRolesFor(user, effectiveRoles),
    [user, effectiveRoles],
  );
  const canSetLocations = ['Owner', 'General Manager'].includes(user?.role)
    && Boolean(hasFeature?.('multi_branches'));
  const deskBranch =
    selectedLocationId && selectedLocationId !== ALL_LOCATIONS
      ? String(selectedLocationId)
      : '';

  const [form, setForm] = useState(() => ({
    ...INIT,
    role: roleOptions[0] || 'Sales',
    canAccessAllLocations: roleOptions[0] === 'General Manager',
    allowedLocationIds: deskBranch ? [deskBranch] : [],
  }));
  const [crossTenant, setCrossTenant] = useState(null);
  const [requesting, setRequesting] = useState(false);
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
    if (roleOptions.includes(form.role)) return;
    setForm((current) => ({
      ...current,
      role: roleOptions[0],
      canAccessAllLocations: roleOptions[0] === 'General Manager',
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
    } else {
      const passwordError = getPasswordStrengthError(form.password, t);
      if (passwordError) e.password = passwordError;
    }

    const usernameError = validateUsernameClient(form.username, t);
    if (usernameError) e.username = usernameError;
    else if (form.username.trim() && (usernameStatus === 'taken' || usernameStatus === 'checking')) {
      e.username = usernameStatus === 'taken'
        ? t('This username is already taken')
        : t('Checking availability…');
    }

    if (!roleOptions.includes(form.role)) {
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
    try {
      const res = await createStaffUser(payload);
      const username = res?.data?.user?.username;
      toast.success(
        `${t('{role} account created!', { role: t(form.role) })}${username ? ` ${t('Username')}: ${username}` : ''}`
      );
      setForm({
        ...INIT,
        role: roleOptions[0] || 'Sales',
        canAccessAllLocations: roleOptions[0] === 'General Manager',
        allowedLocationIds: deskBranch ? [deskBranch] : [],
      });
      setErrors({});
    } catch (err) {
      const code = err.response?.data?.code || err.normalized?.code;
      if (code === 'STAFF_EXISTS_OTHER_TENANT' && err.response?.data?.existing?.userId) {
        setCrossTenant({
          existing: err.response.data.existing,
          payload,
        });
        return;
      }
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || t('Failed to create account.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (preferredDecision) => {
    if (!crossTenant?.existing?.userId) return false;
    setRequesting(true);
    try {
      await createStaffIdentityRequest({
        sourceUserId: crossTenant.existing.userId,
        name: crossTenant.payload.name,
        email: crossTenant.payload.email,
        mobile_number: crossTenant.payload.mobile_number,
        role: crossTenant.payload.role,
        canAccessAllLocations: crossTenant.payload.canAccessAllLocations,
        allowedLocationIds: crossTenant.payload.allowedLocationIds,
        preferredDecision,
      });
      setForm({
        ...INIT,
        role: roleOptions[0] || 'Sales',
        canAccessAllLocations: roleOptions[0] === 'General Manager',
        allowedLocationIds: deskBranch ? [deskBranch] : [],
      });
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || t('Failed to send request.'));
      return false;
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Layout>
      <PageHeader walkthrough="staff-header" title={t('Manage Staff')} subtitle={t('Create a staff account for any role on the platform')} />

      <StaffIdentityRequestModal
        open={Boolean(crossTenant)}
        onClose={() => !requesting && setCrossTenant(null)}
        loading={requesting}
        existing={crossTenant?.existing}
        requestingGymName={tenant?.name || tenant?.slug}
        onSubmit={handleRequestAccess}
      />

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
              {roleOptions.map((role) => (
                <option key={role} value={role}>{t(ROLE_LABELS[role] || role)}</option>
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
