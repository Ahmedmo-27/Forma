import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Modal, Input, Select, Btn, Spinner } from './ui';
import { createMember, getSalesUsers, getCoachTeam } from '../api/endpoints';
import { mapFieldErrors, focusFirstInvalidField } from '../lib/formErrors';
import { isValidPhone, isDateInFuture } from '../lib/validation';

export default function AddMemberModal({ open, onClose, onSuccess, defaultSalesRep = null, initialPhone = '' }) {
  const init = { name: '', phones: initialPhone, gender: '', birthdate: '', source: '', assignedSales: '', coachId: '' };
  const [form, setForm] = useState(init);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Reset form and pre-fill phone when modal opens
  useEffect(() => {
    if (!open) return;
    setForm({ ...init, phones: initialPhone });
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load sales users and coaches when modal opens
  useEffect(() => {
    if (!open) return;
    Promise.all([getSalesUsers(), getCoachTeam()])
      .then(([sRes, cRes]) => {
        setSales(sRes.data.salesUsers ?? []);
        setCoaches(cRes.data.coaches ?? cRes.data.team ?? []);
      })
      .catch(() => {});
  }, [open]);

  const validate = () => {
    const e = {};
    const nameTrim = form.name.trim();
    const phoneTrim = form.phones.trim();

    if (!nameTrim) {
      e.name = 'Name is required';
    } else if (nameTrim.length > 120) {
      e.name = 'Name must not exceed 120 characters';
    }

    if (!phoneTrim) {
      e.phones = 'Phone is required';
    } else if (!isValidPhone(phoneTrim)) {
      e.phones = 'Phone must be 5–40 characters and contain valid phone digits';
    }

    if (form.birthdate && isDateInFuture(form.birthdate)) {
      e.birthdate = 'Birthdate cannot be in the future';
    }

    setErrors(e); 
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await createMember({ 
        name: form.name.trim(), 
        phones: form.phones.trim(), 
        gender: form.gender || null, 
        birthdate: form.birthdate || null, 
        source: form.source || null, 
        assignedSales: form.assignedSales || defaultSalesRep || null,
        coachId: form.coachId || null
      });
      toast.success('Member added!');
      setForm({ name: '', phones: '', gender: '', birthdate: '', source: '', assignedSales: '', coachId: '' }); 
      setErrors({});
      window.dispatchEvent(new CustomEvent('members-changed'));
      onSuccess(res.data?.member?.systemId);
    } catch (e) { 
      if (e.normalized?.code === "VALIDATION_FAILED" && e.normalized.fieldErrors) {
        setErrors(mapFieldErrors(e.normalized.fieldErrors));
        focusFirstInvalidField(e.normalized.fieldErrors);
      } else if (e.normalized?.status !== 403 && e.normalized?.status !== 429) {
        toast.error(e.normalized?.message || e.response?.data?.message || 'Failed to add member.');
      }
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Person"
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Add'}
          </Btn>
        </>
      }>
      <div className="grid-2-form">
        <Input label="Full Name *" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} />
        <Input label="Phone *" value={form.phones} onChange={e => set('phones', e.target.value)} error={errors.phones} />
        <Select label="Gender" value={form.gender} onChange={e => set('gender', e.target.value)}>
          <option value="">— Select —</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </Select>
        <Input label="Birthdate" type="date" value={form.birthdate} onChange={e => set('birthdate', e.target.value)} error={errors.birthdate} />
        <Select label="Source" value={form.source} onChange={e => set('source', e.target.value)}>
          <option value="">— Select —</option>
          {['Social media','Walk in','Word of mouth','referral','sales call','data entry','others'].map(s => 
            <option key={s} value={s}>{s}</option>
          )}
        </Select>
      </div>
      <div className="grid-2-form" style={{ marginTop: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 5 }}>
            Assign Sales Rep
          </label>
          <select 
            value={form.assignedSales} 
            onChange={e => set('assignedSales', e.target.value)}
            style={{ 
              width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', 
              borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)', cursor: 'pointer' 
            }}>
            <option value="">— None —</option>
            {sales.map(s => <option key={s._id} value={s._id}>{s.name} ({s.role})</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 5 }}>
            Assign Coach
          </label>
          <select 
            value={form.coachId} 
            onChange={e => set('coachId', e.target.value)}
            style={{ 
              width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', 
              borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)', cursor: 'pointer' 
            }}>
            <option value="">— None —</option>
            {coaches.filter(c => ['Coach', 'Coach Manager'].includes(c.role)).map(c => 
              <option key={c._id} value={c._id}>{c.name}</option>
            )}
          </select>
        </div>
      </div>
    </Modal>
  );
}
