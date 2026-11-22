import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Modal, Input, Select, Btn, Spinner, ConfirmDialog } from './ui';
import {
  createMember,
  getSalesUsers,
  getCoachTeam,
  assignMemberLocation,
  getPackages,
  assignPackage,
  createPackageException,
} from '../api/endpoints';
import { mapFieldErrors, focusFirstInvalidField } from '../lib/formErrors';
import { isValidPhone, isDateInFuture } from '../lib/validation';
import { useLocationScope, ALL_LOCATIONS } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { hasAccess } from '../lib/access';
import { useI18n } from '../i18n/useI18n';
import { tr } from '../i18n/translate';

// Values are sent to the API as-is; labels are translated at render time.
const SOURCES = [
  tr('Social media'), tr('Walk in'), tr('Word of mouth'), tr('referral'),
  tr('sales call'), tr('data entry'), tr('others'),
];

const EMPTY_PKG = {
  packageId: '',
  name: '',
  activityType: 'gym',
  duration: '',
  price: '',
  pricePaid: '',
  discountPercent: '0',
  freezeLimitDays: '0',
  invitationLimit: '0',
  renewalDiscountPercent: '0',
};

export default function AddMemberModal({ open, onClose, onSuccess, defaultSalesRep = null, initialPhone = '' }) {
  const { t } = useI18n();
  const { user } = useAuth();
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
  const [step, setStep] = useState('details'); // details | package
  const [memberRef, setMemberRef] = useState(null); // { systemId, name }
  const [existingConfirm, setExistingConfirm] = useState(null); // soft conflict payload
  const [packages, setPackages] = useState([]);
  const [pkgForm, setPkgForm] = useState(EMPTY_PKG);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setPkg = (k, v) => setPkgForm((f) => {
    const updated = { ...f, [k]: v };
    if (k === 'price' || k === 'discountPercent') {
      const price = Number(k === 'price' ? v : updated.price) || 0;
      const discount = Math.min(100, Math.max(0, Number(k === 'discountPercent' ? v : updated.discountPercent) || 0));
      updated.pricePaid = String(Math.round(price * (1 - discount / 100)));
    }
    return updated;
  });

  const canAssignDirectly = user?.role === 'Accountant'
    || user?.role === 'Owner'
    || user?.role === 'General Manager'
    || hasAccess(user, 'bypass_package_approval');
  const canRequestPackage = hasAccess(user, 'request_package')
    || user?.role === 'Sales'
    || user?.role === 'Sales Manager';
  const canOfferPackage = canAssignDirectly || canRequestPackage;

  const resetAll = useCallback((loc = defaultLoc) => {
    setForm({
      name: '', phones: '', gender: '', birthdate: '', source: '',
      assignedSales: '', coachId: '', locationId: loc,
    });
    setErrors({});
    setStep('details');
    setMemberRef(null);
    setExistingConfirm(null);
    setPkgForm(EMPTY_PKG);
  }, [defaultLoc]);

  // Reset form and pre-fill phone when modal opens
  useEffect(() => {
    if (!open) return;
    const loc =
      selectedLocationId && selectedLocationId !== ALL_LOCATIONS
        ? selectedLocationId
        : (locations[0]?._id || '');
    setForm({ ...init, phones: initialPhone, locationId: loc });
    setErrors({});
    setStep('details');
    setMemberRef(null);
    setExistingConfirm(null);
    setPkgForm(EMPTY_PKG);
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

  useEffect(() => {
    if (!open || step !== 'package' || !canOfferPackage) return;
    getPackages({ limit: 100 })
      .then((res) => setPackages(res.data?.packages ?? []))
      .catch(() => toast.error(t('Failed to load packages.')));
  }, [open, step, canOfferPackage, t]);

  const finishSuccess = (systemId) => {
    window.dispatchEvent(new CustomEvent('members-changed'));
    resetAll(defaultLoc);
    onSuccess?.(systemId);
  };

  const goToPackageStep = (member) => {
    const systemId = member?.systemId ?? member?._id;
    setMemberRef({ systemId, name: member?.name || form.name.trim() });
    setPkgForm(EMPTY_PKG);
    if (canOfferPackage) {
      setStep('package');
    } else {
      toast.success(t('Member added!'));
      finishSuccess(systemId);
    }
  };

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
      }, { skipGlobalError: true });
      goToPackageStep(res.data?.member);
    } catch (e) {
      const code = e.normalized?.code || e.response?.data?.code;
      const data = e.response?.data || {};
      if (code === 'MEMBER_EXISTS_OTHER_LOCATION' && data.existing) {
        setExistingConfirm(data.existing);
      } else if (code === 'MEMBER_EXISTS_HERE' && (data.member || data.existing)) {
        const member = data.member || data.existing;
        toast.error(t('This member is already registered at this branch.'));
        finishSuccess(member.systemId);
        onClose?.();
      } else if (e.normalized?.code === 'VALIDATION_FAILED' && e.normalized.fieldErrors) {
        setErrors(mapFieldErrors(e.normalized.fieldErrors));
        focusFirstInvalidField(e.normalized.fieldErrors);
      } else if (e.normalized?.status !== 403 && e.normalized?.status !== 429) {
        toast.error(e.normalized?.message || data.message || t('Failed to add member.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmExisting = async () => {
    if (!existingConfirm?.systemId) return;
    setLoading(true);
    try {
      const res = await assignMemberLocation(existingConfirm.systemId, {
        locationId: form.locationId || null,
      });
      toast.success(t('Member linked to this branch.'));
      setExistingConfirm(null);
      goToPackageStep(res.data?.member || existingConfirm);
    } catch (e) {
      toast.error(e.normalized?.message || e.response?.data?.message || t('Failed to link member to branch.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePackageSelect = (id) => {
    const pkg = packages.find((p) => p._id === id);
    if (!pkg) {
      setPkg('packageId', id);
      return;
    }
    const discount = Math.min(100, Math.max(0, Number(pkgForm.discountPercent) || 0));
    setPkgForm({
      packageId: id,
      name: pkg.name,
      activityType: pkg.activityType || 'gym',
      duration: pkg.duration,
      price: String(pkg.price),
      pricePaid: String(Math.round(pkg.price * (1 - discount / 100))),
      discountPercent: String(discount),
      freezeLimitDays: String(pkg.freezeLimitDays ?? 0),
      invitationLimit: String(pkg.invitationLimit ?? 0),
      renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
    });
  };

  const handleAssignPackage = async () => {
    if (!memberRef?.systemId) return;
    if (!pkgForm.packageId) {
      toast.error(t('Select a package.'));
      return;
    }
    if (!pkgForm.name?.trim()) {
      toast.error(t('Package name is required.'));
      return;
    }
    if (Number(pkgForm.pricePaid) <= 0) {
      toast.error(t('Price paid must be greater than zero.'));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        packageId: pkgForm.packageId,
        name: pkgForm.name.trim(),
        activityType: pkgForm.activityType,
        duration: pkgForm.duration,
        price: Number(pkgForm.price) || 0,
        freezeLimitDays: Number(pkgForm.freezeLimitDays) || 0,
        invitationLimit: Number(pkgForm.invitationLimit) || 0,
        renewalDiscountPercent: Number(pkgForm.renewalDiscountPercent) || 0,
        pricePaid: Number(pkgForm.pricePaid),
        discountPercent: Number(pkgForm.discountPercent) || 0,
        locationId: form.locationId || undefined,
      };

      if (canAssignDirectly) {
        await assignPackage(memberRef.systemId, payload);
        toast.success(t('Package assigned.'));
      } else {
        await createPackageException({
          memberId: String(memberRef.systemId),
          basePackageId: pkgForm.packageId,
          hasException: false,
          name: payload.name,
          activityType: payload.activityType,
          duration: payload.duration,
          price: payload.price,
          freezeLimitDays: payload.freezeLimitDays,
          invitationLimit: payload.invitationLimit,
          renewalDiscountPercent: payload.renewalDiscountPercent,
          pricePaid: payload.pricePaid,
          discountPercent: payload.discountPercent,
          reason: null,
        });
        toast.success(t('Package request sent for Owner, GM, or Accountant approval.'));
      }
      finishSuccess(memberRef.systemId);
      onClose?.();
    } catch (e) {
      toast.error(e.normalized?.message || e.response?.data?.message || t('Failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkipPackage = () => {
    const systemId = memberRef?.systemId;
    toast.success(t('Member added!'));
    finishSuccess(systemId);
    onClose?.();
  };

  const handleClose = () => {
    if (loading) return;
    if (step === 'package' && memberRef?.systemId) {
      finishSuccess(memberRef.systemId);
    }
    resetAll(defaultLoc);
    onClose?.();
  };

  const confirmMessage = existingConfirm
    ? t('Is this {name} from {location}?', {
      name: existingConfirm.name || t('this member'),
      location: existingConfirm.locationName || t('another branch'),
    })
    : '';

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={step === 'package' ? t('Assign Package') : t('Add Person')}
        footer={
          step === 'package' ? (
            <>
              <Btn variant="ghost" size="sm" onClick={handleSkipPackage} disabled={loading}>{t('Skip')}</Btn>
              <Btn size="sm" onClick={handleAssignPackage} disabled={loading}>
                {loading ? <Spinner size="sm" /> : (canAssignDirectly ? t('Assign Package') : t('Request Package'))}
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="ghost" size="sm" onClick={handleClose}>{t('Cancel')}</Btn>
              <Btn size="sm" onClick={handleSubmit} disabled={loading}>
                {loading ? <Spinner size="sm" /> : t('Add')}
              </Btn>
            </>
          )
        }
      >
        {step === 'package' ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
              {t('Assign a package for {name} at this branch, or skip for now.', {
                name: memberRef?.name || t('this member'),
              })}
            </p>
            <Select
              label={t('Package')}
              value={pkgForm.packageId}
              onChange={(e) => handlePackageSelect(e.target.value)}
            >
              <option value="">{t('— Select —')}</option>
              {packages.map((pkg) => (
                <option key={pkg._id} value={pkg._id}>
                  {pkg.name}
                </option>
              ))}
            </Select>
            <div className="grid-2-form" style={{ marginTop: 12 }}>
              <Input
                label={t('Price paid')}
                type="number"
                value={pkgForm.pricePaid}
                onChange={(e) => setPkg('pricePaid', e.target.value)}
              />
              <Input
                label={t('Discount %')}
                type="number"
                value={pkgForm.discountPercent}
                onChange={(e) => setPkg('discountPercent', e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(existingConfirm)}
        onClose={() => !loading && setExistingConfirm(null)}
        onConfirm={handleConfirmExisting}
        loading={loading}
        title={t('Member already exists')}
        message={confirmMessage}
        confirmLabel={t('Yes, link to this branch')}
      />
    </>
  );
}
