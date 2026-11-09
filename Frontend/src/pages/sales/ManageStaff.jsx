import { useState } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Input, Select, Btn, Spinner } from '../../components/ui';
import { createStaffUser } from '../../api/endpoints';
import { isValidEmail, isValidPhone } from '../../lib/validation';
import { useAuth } from '../../context/AuthContext';

const ALL_STAFF_ROLES = [
  ['General Manager', 'General Manager'],
  ['Sales Manager', 'Sales Manager'],
  ['Sales', 'Sales Representative'],
  ['Coach Manager', 'Coach Manager'],
  ['Coach', 'Coach'],
  ['Receptionist', 'Receptionist'],
  ['Accountant', 'Accountant'],
];

const CREATABLE_ROLES = {
  Owner: ALL_STAFF_ROLES,
  'General Manager': ALL_STAFF_ROLES,
  'Sales Manager': [
    ['Sales', 'Sales Representative'],
    ['Receptionist', 'Receptionist'],
  ],
  'Coach Manager': [
    ['Coach', 'Coach'],
  ],
};

const INIT = { name: '', email: '', mobile_number: '', password: '', role: 'Sales' };

export default function ManageStaff() {
  usePageTitle('Manage Staff');
  const { user } = useAuth();
  const roleOptions = CREATABLE_ROLES[user?.role] || [];
  const [form, setForm] = useState(INIT);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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

    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await createStaffUser({
        name: form.name.trim(),
        email: form.email.trim(),
        mobile_number: form.mobile_number.trim(),
        password: form.password,
        role: form.role,
      });
      toast.success(`${form.role} account created!`);
      setForm(INIT);
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
      <PageHeader title="Manage Staff" subtitle="Create a staff account for any role on the platform" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32, maxWidth: 480 }}>
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
              onChange={(e) => set('role', e.target.value)}
            >
              {roleOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
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
