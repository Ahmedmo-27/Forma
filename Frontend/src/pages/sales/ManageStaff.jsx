import { useEffect, useState } from 'react';
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

const ALL_STAFF_ROLES = [
  ['General Manager', 'General Manager'],
  ['Sales Manager', 'Sales Manager'],
  ['Sales', 'Sales Representative'],
  ['Head Coach', 'Head Coach'],
  ['Coach', 'Coach'],
  ['Receptionist', 'Receptionist'],
  ['Accountant', 'Accountant'],
];

const CREATABLE_ROLES = {
  Owner: ALL_STAFF_ROLES,
  'General Manager': ALL_STAFF_ROLES.filter(([role]) => role !== 'General Manager'),
  'Sales Manager': [
    ['Sales', 'Sales Representative'],
    ['Receptionist', 'Receptionist'],
  ],
  'Head Coach': [
    ['Coach', 'Coach'],
  ],
};

const INIT = {
  name: '',
  email: '',
  mobile_number: '',
  password: '',
  role: 'Sales',
  canAccessAllLocations: false,
  allowedLocationIds: [],
};

export default function ManageStaff() {
  usePageTitle('Manage Staff');
  const { user } = useAuth();
  const { hasFeature } = useTenant() || {};
  const { selectedLocationId } = useLocationScope();
  const roleOptions = CREATABLE_ROLES[user?.role] || [];
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

  const validate = () => {
    const e = {};
    const nameTrim = form.name.trim();
    const emailTrim = form.email.trim();
    const mobileTrim = form.mobile_number.trim();

    if (!nameTrim) {
      e.name = 'Name is required';
    } else if (nameTrim.length > 120) {
      e.name = 'Name must not exceed 120 characters';
    }

    if (!emailTrim) {
      e.email = 'Email is required';
    } else if (!isValidEmail(emailTrim)) {
      e.email = 'Enter a valid email address';
    }

    if (!mobileTrim) {
      e.mobile_number = 'Mobile number is required';
    } else if (!isValidPhone(mobileTrim)) {
      e.mobile_number = 'Enter a valid mobile phone number (5–40 characters)';
    }

    if (!form.password) {
      e.password = 'Password is required';
    } else if (form.password.length < 8) {
      e.password = 'Password must be at least 8 characters';
    } else if (form.password.length > 200) {
      e.password = 'Password must not exceed 200 characters';
    }

    if (!roleOptions.some(([role]) => role === form.role)) {
      e.role = 'Please select a valid staff role';
    }

    if (
      canSetLocations
      && !form.canAccessAllLocations
      && !(form.allowedLocationIds || []).length
    ) {
      e.allowedLocationIds = 'Select at least one branch, or enable all locations';
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
      if (canSetLocations) {
        payload.canAccessAllLocations = Boolean(form.canAccessAllLocations);
        payload.allowedLocationIds = form.canAccessAllLocations
          ? []
          : (form.allowedLocationIds || []);
      }
      await createStaffUser(payload);
      toast.success(`${form.role} account created!`);
      setForm({
        ...INIT,
        role: roleOptions[0]?.[0] || 'Sales',
        canAccessAllLocations: roleOptions[0]?.[0] === 'General Manager',
        allowedLocationIds: deskBranch ? [deskBranch] : [],
      });
      setErrors({});
    } catch (err) {
      if (err.normalized?.status !== 403 && err.normalized?.status !== 429) {
        toast.error(err.normalized?.message || err.response?.data?.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <PageHeader walkthrough="staff-header" title="Manage Staff" subtitle="Create a staff account for any role on the platform" />

      <div className="page-wrap" data-walkthrough="staff-board" style={{ paddingTop: 20, paddingBottom: 32, maxWidth: 480 }}>
        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="Full Name *"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
            />
            <Input
              label="Email *"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <Input
              label="Mobile Number *"
              value={form.mobile_number}
              onChange={(e) => set('mobile_number', e.target.value)}
              error={errors.mobile_number}
              placeholder="e.g. 01012345678"
            />
            <Input
              label="Password *"
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              error={errors.password}
            />
            <Select
              label="Role *"
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
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>

            {canSetLocations && (
              <LocationAccessEditor
                embedded
                title="Branch viewing access"
                description="Choose whether this user can view data for all branches or only selected ones."
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
                {loading ? <Spinner size="sm" /> : 'Create Account'}
              </Btn>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
