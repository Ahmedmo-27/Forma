import { useState } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Input, Select, Btn, Spinner } from '../../components/ui';
import { createStaffUser } from '../../api/endpoints';

const INIT = { name: '', email: '', mobile_number: '', password: '', role: 'Sales' };

export default function ManageStaff() {
  usePageTitle('Manage Staff');
  const [form, setForm] = useState(INIT);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    if (!form.mobile_number.trim()) e.mobile_number = 'Mobile number is required';
    if (!form.password || form.password.length < 6) e.password = 'Password must be at least 6 characters';
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
      <PageHeader title="Manage Staff" subtitle="Create accounts for sales representatives, receptionists, and accountants" />

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
              <option value="Sales">Sales Representative</option>
              <option value="Receptionist">Receptionist</option>
              <option value="Accountant">Accountant</option>
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
