import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Modal, Input, Select, Btn, Spinner } from './ui';
import { createMember, getSalesUsers, getCoachTeam } from '../api/endpoints';
import { mapFieldErrors, focusFirstInvalidField } from '../lib/formErrors';
import { isValidPhone, isDateInFuture } from '../lib/validation';
import { useLocationScope, ALL_LOCATIONS } from '../context/LocationContext';
import { useI18n } from '../i18n/useI18n';
import { tr } from '../i18n/translate';

// Values are sent to the API as-is; labels are translated at render time.
const SOURCES = [
  tr('Social media'), tr('Walk in'), tr('Word of mouth'), tr('referral'),
  tr('sales call'), tr('data entry'), tr('others'),
];

export default function AddMemberModal({ open, onClose, onSuccess, defaultSalesRep = null, initialPhone = '' }) {
  const { t } = useI18n();
  const { multiEnabled, locations, selectedLocationId } = useLocationScope();
  const defaultLoc =
    selectedLocationId && selectedLocationId !== ALL_LOCATIONS
      ? selectedLocationId
      : (locations[0]?._id || '');
  const init = {
    name: '', phones: initialPhone, gender: '', birthdate: '', source: '',
    assignedSales: '', coachId: '', locationId: defaultLoc,
  };
  const [form, setForm] = useState(init);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Reset form and pre-fill phone when modal opens
  useEffect(() => {
    if (!open) return;
    const loc =
      selectedLocationId && selectedLocationId !== ALL_LOCATIONS
        ? selectedLocationId
        : (locations[0]?._id || '');
    setForm({ ...init, phones: initialPhone, locationId: loc });
    setErrors({});
  }, [open, selectedLocationId, locations]); // eslint-disable-line react-hooks/exhaustive-deps

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
      e.name = t('Name is required');
    } else if (nameTrim.length > 120) {
      e.name = t('Name must not exceed 120 characters');
    }

    if (!phoneTrim) {
      e.phones = t('Phone is required');
    } else if (!isValidPhone(phoneTrim)) {
      e.phones = t('Phone must be 5–40 characters and contain valid phone digits');
    }

    if (form.birthdate && isDateInFuture(form.birthdate)) {
      e.birthdate = t('Birthdate cannot be in the future');
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
        coachId: form.coachId || null,
        locationId: form.locationId || null,
      });
      toast.success(t('Member added!'));
      setForm({
        name: '', phones: '', gender: '', birthdate: '', source: '',
        assignedSales: '', coachId: '', locationId: defaultLoc,
      }); 
      setErrors({});
      window.dispatchEvent(new CustomEvent('members-changed'));
      onSuccess(res.data?.member?.systemId);
    } catch (e) { 
      if (e.normalized?.code === "VALIDATION_FAILED" && e.normalized.fieldErrors) {
        setErrors(mapFieldErrors(e.normalized.fieldErrors));
        focusFirstInvalidField(e.normalized.fieldErrors);
      } else if (e.normalized?.status !== 403 && e.normalized?.status !== 429) {
        toast.error(e.normalized?.message || e.response?.data?.message || t('Failed to add member.'));
      }
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('Add Person')}
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>{t('Cancel')}</Btn>
          <Btn size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? <Spinner size="sm" /> : t('Add')}
          </Btn>
        </>
      }>
      <div data-walkthrough="add-guest-form" className="grid-2-form">
        <Input label={t('Full Name *')} value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} />
        <Input label={t('Phone *')} value={form.phones} onChange={e => set('phones', e.target.value)} error={errors.phones} />
        <Select label={t('Gender')} value={form.gender} onChange={e => set('gender', e.target.value)}>
          <option value="">{t('— Select —')}</option>
          <option value="male">{t('Male')}</option>
          <option value="female">{t('Female')}</option>
        </Select>
        <Input label={t('Birthdate')} type="date" value={form.birthdate} onChange={e => set('birthdate', e.target.value)} error={errors.birthdate} />
        <Select label={t('Source')} value={form.source} onChange={e => set('source', e.target.value)}>
          <option value="">{t('— Select —')}</option>
          {SOURCES.map(s =>
            <option key={s} value={s}>{t(s)}</option>
          )}
        </Select>
      </div>
      {multiEnabled && locations.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Select label={t('Location')} value={form.locationId} onChange={e => set('locationId', e.target.value)}>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>{loc.name}</option>
            ))}
          </Select>
        </div>
      )}
      <div className="grid-2-form" style={{ marginTop: 12 }}>
        <Select label={t('Assign Sales Rep')} value={form.assignedSales} onChange={e => set('assignedSales', e.target.value)}>
          <option value="">{t('— None —')}</option>
          {sales.map(s => <option key={s._id} value={s._id}>{`${s.name} (${t(s.role)})`}</option>)}
        </Select>
        <Select label={t('Assign Coach')} value={form.coachId} onChange={e => set('coachId', e.target.value)}>
          <option value="">{t('— None —')}</option>
          {coaches.filter(c => ['Coach', 'Head Coach'].includes(c.role)).map(c =>
            <option key={c._id} value={c._id}>{c.name}</option>
          )}
        </Select>
      </div>
    </Modal>
  );
}
