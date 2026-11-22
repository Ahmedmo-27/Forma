import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal, Btn, Badge, CAIRO_ZONE, Input, Select, Spinner, Alert, toLocalDateString } from '../ui';
import SalesManagerSection from './SalesManagerSection';
import PackageTermsGrid from './PackageTermsGrid';
import { updateMemberSubscription } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

const ACTIVITY_TYPES = [tr('gym'), tr('crossfit'), tr('box'), tr('mma'), tr('kickboxing'), tr('calisthenics')];
const DURATIONS = [tr('1 month'), tr('3 months'), tr('6 months'), tr('1 year')];
const EDIT_ROLES = new Set(['Owner', 'General Manager', 'Sales Manager']);

function DetailRow({ label, value }) {
  return (
    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{value ?? '—'}</div>
    </div>
  );
}

function formFromContract(contract) {
  const pkg = contract?.packageSnapshot ?? contract?.package ?? {};
  return {
    name: pkg.name ?? '',
    activityType: pkg.activityType ?? 'gym',
    duration: pkg.duration ?? '1 month',
    price: String(pkg.price ?? ''),
    freezeLimitDays: String(pkg.freezeLimitDays ?? 0),
    invitationLimit: String(pkg.invitationLimit ?? 0),
    renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
    pricePaid: String(contract?.pricePaid ?? ''),
    discountPercent: String(contract?.discountPercent ?? 0),
    startDate: contract?.startDate ? toLocalDateString(contract.startDate) : '',
    endDate: contract?.endDate ? toLocalDateString(contract.endDate) : '',
    reason: '',
  };
}

export default function ContractDetailModal({ contract, open, onClose, onSaved }) {
  const { t } = useI18n();
  const { fmtDateTime } = useFormat();
  const { currency = 'EGP' } = useTenant() || {};
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFromContract(contract));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      return;
    }
    setForm(formFromContract(contract));
    setEditing(false);
  }, [open, contract]);

  if (!open || !contract) return null;

  const memberId = contract.member?.systemId ?? contract.member?._id;
  const isDirect = contract.source === 'direct_assignment';
  const isClosed = Boolean(contract.refunded || contract.cancelled || Number(contract.refundAmount) > 0);
  const canEdit = EDIT_ROLES.has(user?.role) && !contract.signed && !isClosed;

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'price' || key === 'discountPercent') {
        const price = Number(key === 'price' ? value : next.price) || 0;
        const discount = Math.min(100, Math.max(0, Number(key === 'discountPercent' ? value : next.discountPercent) || 0));
        next.pricePaid = String(Math.round(price * (1 - discount / 100)));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error(t('Package name is required.')); return; }
    if (!form.duration) { toast.error(t('Duration is required.')); return; }
    if (form.pricePaid === '' || isNaN(Number(form.pricePaid)) || Number(form.pricePaid) < 0) {
      toast.error(t('Price paid must be a non-negative number.'));
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error(t('Start and end dates are required.'));
      return;
    }
    if (form.endDate <= form.startDate) {
      toast.error(t('End date must be after start date.'));
      return;
    }

    const memberKey = contract.member?.systemId ?? contract.member?._id;
    const subscriptionKey = contract._id ?? contract.subscriptionId;
    if (!memberKey || !subscriptionKey) {
      toast.error(t('Failed to update package.'));
      return;
    }

    setSaving(true);
    try {
      await updateMemberSubscription(memberKey, subscriptionKey, {
        name: form.name.trim(),
        activityType: form.activityType,
        duration: form.duration,
        price: Number(form.price) || 0,
        freezeLimitDays: Number(form.freezeLimitDays) || 0,
        invitationLimit: Number(form.invitationLimit) || 0,
        renewalDiscountPercent: Number(form.renewalDiscountPercent) || 0,
        pricePaid: Number(form.pricePaid),
        discountPercent: Number(form.discountPercent) || 0,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason?.trim() || undefined,
      });
      toast.success(t('Package updated.'));
      setEditing(false);
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to update package.'));
    } finally {
      setSaving(false);
    }
  };

  const footer = editing ? (
    <>
      <Btn variant="ghost" size="sm" onClick={() => { setEditing(false); setForm(formFromContract(contract)); }} disabled={saving}>
        {t('Cancel')}
      </Btn>
      <Btn size="sm" onClick={handleSave} disabled={saving}>
        {saving ? <Spinner size="sm" /> : t('Save changes')}
      </Btn>
    </>
  ) : (
    <>
      {canEdit && (
        <Btn variant="outline" size="sm" onClick={() => setEditing(true)}>{t('Edit')}</Btn>
      )}
      <Btn variant="ghost" size="sm" onClick={onClose}>{t('Close')}</Btn>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose?.()}
      title={t('Contract #{id}', { id: contract.subscriptionId ?? '—' })}
      size="lg"
      footer={footer}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Badge status={isDirect ? 'active' : 'accepted'} />
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--t3)',
          background: 'var(--bg)', border: '1px solid var(--border)',
          padding: '2px 8px', borderRadius: 4,
        }}>
          {isDirect ? t('Direct Assignment') : t('Approved Request')}
        </span>
        {contract.isRenewal && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--amber)',
            background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {t('Renewal')}
          </span>
        )}
        {contract.signed && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--green)',
            background: 'var(--green-bg)', border: '1px solid var(--green-bd)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {t('Signed')}
          </span>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden', marginBottom: 16,
      }}>
        <DetailRow label={t('Member')} value={
          memberId
            ? <Link to={`/members/${memberId}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}><bdi>{contract.member?.name ?? '—'}</bdi></Link>
            : (contract.member?.name ?? '—')
        } />
        <DetailRow label={t('Contract #')} value={contract.subscriptionId ?? '—'} />
        <DetailRow label={t('Price Paid')} value={contract.pricePaid != null ? contract.pricePaid : '—'} />
        <DetailRow label={t('Refund')} value={Number(contract.refundAmount) > 0 ? contract.refundAmount : '—'} />
        <DetailRow label={t('Net')} value={contract.netPaid ?? contract.pricePaid ?? '—'} />
        <DetailRow label={t('Date Added')} value={contract.createdAt ? fmtDateTime(contract.createdAt, {
          timeZone: CAIRO_ZONE,
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }, 'en-US') : '—'} />
        <DetailRow label={t('Processed By')} value={contract.approvedBy?.name} />
      </div>

      <SalesManagerSection salesManager={contract.salesManager} directAssignment={isDirect} />

      {editing ? (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            {t('Package Terms')}
          </p>
          <Alert type="info">
            {t('Changes apply to this membership only. Signed contracts cannot be edited.')}
          </Alert>
          <div className="grid-2" style={{ marginTop: 4 }}>
            <Input label={t('Package Name')} value={form.name} onChange={set('name')} />
            <Select label={t('Activity')} value={form.activityType} onChange={set('activityType')}>
              {ACTIVITY_TYPES.map((a) => <option key={a} value={a}>{t(a)}</option>)}
            </Select>
            <Select label={t('Duration')} value={form.duration} onChange={set('duration')}>
              {DURATIONS.map((d) => <option key={d} value={d}>{t(d)}</option>)}
            </Select>
            <Input label={t('Price ({currency})', { currency })} type="number" value={form.price} onChange={set('price')} />
            <Input label={t('Price Paid ({currency})', { currency })} type="number" value={form.pricePaid} onChange={set('pricePaid')} />
            <Input label={t('Discount %')} type="number" min="0" max="100" value={form.discountPercent} onChange={set('discountPercent')} />
            <Input label={t('Freeze Limit (days)')} type="number" value={form.freezeLimitDays} onChange={set('freezeLimitDays')} />
            <Input label={t('Invitation Slots')} type="number" value={form.invitationLimit} onChange={set('invitationLimit')} />
            <Input label={t('Renewal Discount %')} type="number" min="0" max="100" value={form.renewalDiscountPercent} onChange={set('renewalDiscountPercent')} />
            <Input label={t('Start Date')} type="date" value={form.startDate} onChange={set('startDate')} />
            <Input label={t('End Date')} type="date" value={form.endDate} onChange={set('endDate')} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label={t('Reason')} value={form.reason} onChange={set('reason')} placeholder={t('Optional note for this edit')} />
            </div>
          </div>
        </div>
      ) : (
        <PackageTermsGrid data={contract} title={t('Package Terms')} showEndDate />
      )}

      {!canEdit && contract.signed && (
        <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 12 }}>
          {t('This contract is signed and cannot be edited.')}
        </p>
      )}
      {!canEdit && isClosed && !contract.signed && (
        <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 12 }}>
          {t('Refunded or cancelled packages cannot be edited.')}
        </p>
      )}
    </Modal>
  );
}
