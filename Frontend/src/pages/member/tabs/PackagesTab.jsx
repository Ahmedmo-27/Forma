import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Badge, Table, EmptyState, Btn, Modal, Input, Textarea, Select, Spinner, ConfirmDialog, Switch, Alert, toLocalDateString } from '../../../components/ui';
import { getPackages, getMemberPendingException, createPackageException, updatePackageExceptionStatus, assignPackage, updateMemberSubscription, createPackage, addPTSessions, refundMember, refundPTSessions, cancelMemberPackage, transferMemberPackage } from '../../../api/endpoints';
import CatalogPackageForm, { EMPTY_PACKAGE_FORM, validatePackageForm, packageFormToPayload } from '../../../components/PackageForm';
import PackageAcceptModal from '../../../components/accounting/PackageAcceptModal';
import { useTenant } from '../../../context/TenantContext';
import { useTourReveal, useWalkthrough } from '../../../tutorials/walkthrough-context';
import useLocationEffect from '../../../hooks/useLocationEffect';
import { ArrowLeftRight, Ban, Banknote, Calendar, CircleOff, CornerDownLeft, FileSignature, Pencil } from 'lucide-react';
import ContractSignModal from '../../../components/contracts/ContractSignModal';
import { useI18n } from '../../../i18n/useI18n';
import { useFormat } from '../../../i18n/useFormat';
import { tr } from '../../../i18n/translate';
import { hasAccess } from '../../../lib/access';
import { useMemberDates } from '../useMemberDates';
import { rich } from '../richText';

// Raw values are sent to the API; only the displayed label is translated (`t(value)`).
const ACTIVITY_TYPES = [tr('gym'), tr('crossfit'), tr('box'), tr('mma'), tr('kickboxing'), tr('calisthenics')];
const DURATIONS = [tr('1 month'), tr('3 months'), tr('6 months'), tr('1 year')];

function monthsLabel(t, count) {
  return count === 1 ? t('1 month') : t('{count} months', { count });
}

const EMPTY_FORM = {
  basePackageId: '', name: '', activityType: 'gym', duration: '1 month',
  price: '', freezeLimitDays: '0', invitationLimit: '0', renewalDiscountPercent: '0',
  description: '', pricePaid: '', discountPercent: '0', startDate: '', reason: '',
};

function isClosedSubscription(sub) {
  if (!sub) return true;
  if (Number(sub.refundAmount) > 0) return true;
  return Boolean(sub.refunded || sub.cancelled || sub.subscriptionStatus === 'cancelled');
}

function isForfeitedCancellation(sub) {
  if (!sub || sub.refunded || Number(sub.refundAmount) > 0) return false;
  return Boolean(String(sub.cancelReason || '').trim());
}

function isTransferredAway(sub) {
  return Boolean(sub?.transferredTo);
}

function defaultPackageStart(member) {
  const open = [...(member.subscriptions || [])].reverse().find((sub) => !isClosedSubscription(sub));
  if (!open?.endDate) return '';
  const currentEnd = new Date(open.endDate);
  return currentEnd > new Date() ? toLocalDateString(currentEnd) : '';
}

export default function PackagesTab({ member, user, onRefresh }) {
  const { t } = useI18n();
  const { isActive, currentStep } = useWalkthrough();
  const [tab, setTab] = useState('packages'); // 'packages' | 'pt-sessions'

  useEffect(() => {
    if (!isActive || !currentStep) return undefined;
    const showSessions = currentStep.target === 'pt-sessions-panel' || currentStep.reveal === 'pt-sessions';
    const showPackages = currentStep.memberTab === 'packages'
      && currentStep.target !== 'package-subtabs'
      && !showSessions;
    if (!showSessions && !showPackages) return undefined;
    const frame = requestAnimationFrame(() => setTab(showSessions ? 'pt-sessions' : 'packages'));
    return () => cancelAnimationFrame(frame);
  }, [isActive, currentStep]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tabs */}
      <div data-walkthrough="package-subtabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'packages', label: t('Packages') },
          { id: 'pt-sessions', label: t('Private Sessions') },
        ].map(st => (
          <button key={st.id} onClick={() => setTab(st.id)} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === st.id ? 'var(--navy)' : 'transparent'}`,
            marginBottom: -1,
            color: tab === st.id ? 'var(--t1)' : 'var(--t3)',
            fontSize: 13, fontWeight: tab === st.id ? 700 : 400,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'color 0.12s',
          }}
            onMouseEnter={e => { if (tab !== st.id) e.currentTarget.style.color = 'var(--t2)'; }}
            onMouseLeave={e => { if (tab !== st.id) e.currentTarget.style.color = 'var(--t3)'; }}
          >{st.label}</button>
        ))}
      </div>

      {tab === 'packages' && <PackagesContent member={member} user={user} onRefresh={onRefresh} />}
      {tab === 'pt-sessions' && <PTSessionsContent member={member} user={user} onRefresh={onRefresh} />}
    </div>
  );
}

// ── Private Sessions Sub-tab ──────────────────────────────────────────────────
function PTSessionsContent({ member, user, onRefresh }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const { fmtDate, fmtDateTime } = useMemberDates();
  const { currency = 'EGP' } = useTenant() || {};
  const money = (n) => `${currency} ${fmtNumber(n)}`;
  const [sessions, setSessions] = useState('');
  const [startDate, setStartDate] = useState(toLocalDateString());
  const [durationMonths, setDurationMonths] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // PT refund
  const [showPTRefundModal, setShowPTRefundModal] = useState(false);
  const [ptRefundAmount, setPTRefundAmount]       = useState('');
  const [ptRefundReason, setPTRefundReason]       = useState('');
  const [ptRefunding, setPTRefunding]             = useState(false);

  const canAdd = ['Owner', 'Accountant', 'Coach', 'Head Coach'].includes(user?.role);
  const canRefund = ['Owner', 'Accountant', 'General Manager'].includes(user?.role);

  const ptSubs = member.pt_subscriptions ?? [];
  const latestSub = [...ptSubs].reverse().find((sub) => !(sub.refunded === true || Number(sub.refundAmount) > 0)) || null;
  const totalSessions = member.PT_sessions ?? 0;
  const usedSessions  = member.used_PT_sessions ?? 0;
  const remaining     = totalSessions - usedSessions;
  const ptStart = member.PT_sessions_startDate;
  const ptEnd   = member.PT_sessions_expDate;

  const handleAdd = async () => {
    const num = Number(sessions);
    if (!num || num <= 0 || !Number.isInteger(num)) { toast.error(t('Enter a valid whole number of sessions')); return; }
    const months = Number(durationMonths);
    if (!months || months <= 0) { toast.error(t('Enter a valid duration in months')); return; }
    if (!startDate || isNaN(Date.parse(startDate))) { toast.error(t('Valid start date is required')); return; }
    const paid = Number(pricePaid);
    if (pricePaid !== '' && (isNaN(paid) || paid < 0)) { toast.error(t('Price paid must be a non-negative number')); return; }
    setLoading(true);
    try {
      await addPTSessions(member.systemId ?? member._id, {
        numberOfSessions: num,
        startDate,
        durationMonths: months,
        pricePaid: Number(pricePaid) || 0,
      });
      toast.success(t('Added {count} private session(s)', { count: num }));
      setSessions('');
      setDurationMonths('');
      setPricePaid('');
      setShowAddModal(false);
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || t('Failed to add sessions'));
    } finally { setLoading(false); }
  };

  const handlePTRefund = async () => {
    const amount = Number(ptRefundAmount);
    if (!amount || amount <= 0) { toast.error(t('Enter a valid refund amount')); return; }
    const lastPTSub = member.pt_subscriptions?.at(-1);
    const maxRefund = (lastPTSub?.pricePaid ?? 0) - (lastPTSub?.refundAmount ?? 0);
    if (amount > maxRefund) {
      toast.error(t('Refund amount cannot exceed maximum refundable ({amount})', { amount: money(maxRefund) }));
      return;
    }
    setPTRefunding(true);
    try {
      const res = await refundPTSessions(member._id, amount, ptRefundReason.trim() || undefined);
      toast.success(res.data.message ?? t('PT sessions refund issued successfully'));
      setShowPTRefundModal(false);
      setPTRefundAmount('');
      setPTRefundReason('');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('PT refund failed.'));
    } finally { setPTRefunding(false); }
  };

  const activeDetails = totalSessions > 0 ? [
    { label: t('Total Sessions'), value: totalSessions },
    { label: t('Used'), value: usedSessions },
    { label: t('Remaining'), value: remaining },
    { label: t('Start'), value: ptStart ? fmtDate(ptStart) : '—' },
    { label: t('Expiry'), value: ptEnd ? fmtDate(ptEnd) : '—' },
    { label: t('Duration'), value: latestSub ? monthsLabel(t, latestSub.durationMonths) : '—' },
    { label: t('Price Paid'), value: latestSub?.pricePaid ? money(latestSub.pricePaid) : '—' },
    { label: t('Status'), value: <Badge status={remaining > 0 && ptEnd && new Date(ptEnd) > new Date() ? 'active' : 'expired'} /> },
    { label: t('Coach'), value: member.current_couch?.name ?? '—' },
  ] : [];

  return (
    <div data-walkthrough="pt-sessions-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Active Sessions Card */}
      <Card>
        <CardHeader title={t('Active Private Sessions')}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {canRefund && (member.pt_subscriptions?.length ?? 0) > 0 && (
              <Btn variant="outline" size="xs" onClick={() => setShowPTRefundModal(true)}><Banknote size={14} aria-hidden /> {t('Refund')}</Btn>
            )}
            {canAdd && (
              <Btn size="xs" onClick={() => setShowAddModal(true)}>{t('+ Add Sessions')}</Btn>
            )}
          </div>
        </CardHeader>

        {totalSessions === 0
          ? <EmptyState message={t('No active private sessions')} sub={canAdd ? t('Click + Add Sessions to assign PT sessions to this member.') : t('No private sessions assigned yet.')} />
          : <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1,
              background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
            }}>
              {activeDetails.map(d => (
                <div key={d.label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{d.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{d.value ?? '—'}</div>
                </div>
              ))}
            </div>
        }
      </Card>

      {/* Session History Table */}
      <Card noPad>
        <div style={{ padding: '14px 18px 0' }}>
          <CardHeader title={t('Session History ({count})', { count: ptSubs.length })} />
        </div>
        {!ptSubs.length ? <EmptyState message={t('No session records yet')} /> :
          <Table headers={['#', t('Sessions'), t('Duration'), t('Start'), t('Expiry'), t('Price Paid'), t('Coach'), t('Date Added'), t('Refund')]}>
            {[...ptSubs].reverse().map((sub, i) => {
              const isPTRefunded = sub.refunded === true || (sub.refundAmount ?? 0) > 0;
              return (
              <tr key={sub._id ?? i} className="tbl-row" style={{ borderBottom: '1px solid var(--border)', background: isPTRefunded ? 'var(--red-bg)' : 'transparent' }}>
                <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{ptSubs.length - i}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{sub.sessions}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{monthsLabel(t, sub.durationMonths)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(sub.startDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(sub.endDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>
                  {isPTRefunded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--t4)', fontWeight: 400 }}>{sub.pricePaid ? money(sub.pricePaid) : '—'}</span>
                      <span style={{ color: 'var(--green)' }}>{money((sub.pricePaid ?? 0) - (sub.refundAmount ?? 0))}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--green)' }}>{sub.pricePaid ? money(sub.pricePaid) : '—'}</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{member.current_couch?.name ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{fmtDateTime(sub.createdAt)}</td>
                <td style={{ padding: '10px 14px' }}>
                  {isPTRefunded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700,
                        background: 'var(--red-bg)', color: 'var(--red)',
                        border: '1px solid var(--red-bd)',
                        padding: '2px 8px', borderRadius: 4,
                      }}><CornerDownLeft size={12} aria-hidden /> {t('Refunded')}</span>
                      {sub.refundAmount > 0 && (
                        <span dir="ltr" style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, unicodeBidi: 'isolate' }}>−{money(sub.refundAmount)}</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--t4)' }}>—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </Table>
        }
      </Card>

      {/* Add Sessions Modal */}
      <Modal open={showAddModal} onClose={() => !loading && setShowAddModal(false)} title={t('Add Private Sessions')} size="md"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowAddModal(false)} disabled={loading}>{t('Cancel')}</Btn>
          <Btn size="sm" onClick={handleAdd} disabled={loading}>
            {loading ? <Spinner size="sm" /> : t('Add Sessions')}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          {rich(t('Add PT sessions to {member}. Duration in months (e.g. 1, 2.5, 3). Half months = 15 days.'), { member: <strong><bdi>{member.name}</bdi></strong> })}
        </p>
        <div className="grid-2-form">
          <Input
            label={t('Number of Sessions *')}
            type="number" min="1"
            value={sessions}
            onChange={e => setSessions(e.target.value)}
            placeholder={t('e.g. 10')}
          />
          <Input
            label={t('Start Date *')}
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <Input
            label={t('Duration (months) *')}
            type="number" min="0.5" step="0.5"
            value={durationMonths}
            onChange={e => setDurationMonths(e.target.value)}
            placeholder={t('e.g. 2.5')}
          />
          <Input
            label={t('Price Paid ({currency})', { currency })}
            type="number" min="0"
            value={pricePaid}
            onChange={e => setPricePaid(e.target.value)}
            placeholder={t('e.g. 500')}
          />
        </div>
      </Modal>

      {/* PT Refund Modal */}
      <Modal open={showPTRefundModal} onClose={() => !ptRefunding && setShowPTRefundModal(false)} title={t('Refund Private Sessions')} size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowPTRefundModal(false)} disabled={ptRefunding}>{t('Cancel')}</Btn>
          <Btn variant="danger" size="sm" onClick={handlePTRefund} disabled={ptRefunding}>
            {ptRefunding ? <Spinner size="sm" /> : t('Confirm Refund')}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {rich(t('Any amount cancels the last PT pack for {member}. Sessions from that pack are removed once. Another refund on the same sale only returns money still left.'), { member: <strong><bdi>{member.name}</bdi></strong> })}
        </p>
        {(() => {
          const lastPTSub = member.pt_subscriptions?.at(-1);
          const pricePaidVal = lastPTSub?.pricePaid ?? 0;
          const alreadyRefunded = lastPTSub?.refundAmount ?? 0;
          const maxRefund = pricePaidVal - alreadyRefunded;
          return (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Price Paid')}</span>
                <span style={{ fontWeight: 700 }}>{fmtNumber(pricePaidVal)} {currency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Sessions')}</span>
                <span style={{ fontWeight: 700 }}>{lastPTSub?.sessions ?? 0}</span>
              </div>
              {alreadyRefunded > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Already Refunded')}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{fmtNumber(alreadyRefunded)} {currency}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Max Refundable')}</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtNumber(maxRefund)} {currency}</span>
              </div>
            </div>
          );
        })()}
        <Input
          label={t('Refund Amount ({currency}) *', { currency })}
          type="number" min="1"
          value={ptRefundAmount}
          onChange={e => setPTRefundAmount(e.target.value)}
          placeholder={t('Enter amount to refund')}
        />
        <Input
          label={t('Reason (optional)')}
          value={ptRefundReason}
          onChange={e => setPTRefundReason(e.target.value)}
          placeholder={t('e.g. Member cancelled sessions')}
        />
      </Modal>
    </div>
  );
}

// ── Packages Sub-tab (original content) ───────────────────────────────────────
function PackagesContent({ member, user, onRefresh }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const { fmtDate, fmtDateTime } = useMemberDates();
  const { currency = 'EGP', tenant } = useTenant() || {};
  const money = (n) => `${currency} ${fmtNumber(n)}`;
  const defaultTransferFee = tenant?.settings?.packageTransferFee ?? 0;
  const [pending, setPending] = useState(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [packageMode, setPackageMode] = useState('add');
  useTourReveal('add-package', () => setShowAddPackage(true), () => setShowAddPackage(false));
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Refund package
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount]       = useState('');
  const [refundReason, setRefundReason]       = useState('');
  const [refunding, setRefunding]             = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [contractSub, setContractSub] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [cancelReason, setCancelReason]       = useState('');
  const [cancelling, setCancelling]           = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFee, setTransferFee] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [recipientMode, setRecipientMode] = useState('existing');
  const [recipientSystemId, setRecipientSystemId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newGender, setNewGender] = useState('');
  const [newBirthdate, setNewBirthdate] = useState('');
  const [transferring, setTransferring] = useState(false);
  useTourReveal('cancel-package', () => setShowCancelModal(true), () => setShowCancelModal(false));
  useTourReveal(
    'transfer-package',
    () => {
      setTransferFee(String(defaultTransferFee ?? 0));
      setSaveAsDefault(false);
      setRecipientMode('existing');
      setShowTransferModal(true);
    },
    () => setShowTransferModal(false),
  );

  const isSalesManager = user?.role === 'Sales Manager';
  const isSales = user?.role === 'Sales';
  const isAccountant = user?.role === 'Accountant';
  const isOwner = user?.role === 'Owner';
  const isGM = user?.role === 'General Manager';
  const canBypassPackageApproval = hasAccess(user, 'bypass_package_approval');
  const canRequestPackage = hasAccess(user, 'request_package') || isSales || isSalesManager;
  const canReviewException = hasAccess(user, 'package_approvals')
    || isAccountant || isOwner || isGM;
  const canAssignPackageDirectly = isAccountant || isOwner || isGM || canBypassPackageApproval;
  const canCreateCatalogPackage = hasAccess(user, 'packages') && (isSalesManager || isOwner || isGM);
  const canAddPackage = canRequestPackage || isAccountant || isOwner || isGM || canBypassPackageApproval;
  const requestOnly = canRequestPackage && !canAssignPackageDirectly;
  const canRefund = isOwner || isAccountant || isGM;
  const canTransfer = isOwner || isAccountant || isGM;
  const canEditSubscription = isOwner || isGM || isSalesManager;
  const memberKey = member.systemId ?? member._id;

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await getMemberPendingException(memberKey);
      setPending(res.data?.request ?? null);
    } catch {
      setPending(null);
    } finally {
      setLoadingPending(false);
    }
  }, [memberKey]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleRefundPackage = async () => {
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) { toast.error(t('Enter a valid refund amount')); return; }
    const lastSub = member.subscriptions?.at(-1);
    const maxRefund = (lastSub?.pricePaid ?? 0) - (lastSub?.refundAmount ?? 0);
    if (amount > maxRefund) {
      toast.error(t('Refund amount cannot exceed maximum refundable ({amount})', { amount: money(maxRefund) }));
      return;
    }
    setRefunding(true);
    try {
      const res = await refundMember(member._id, amount, refundReason.trim() || undefined);
      toast.success(res.data.message ?? t('Refund issued successfully'));
      setShowRefundModal(false);
      setRefundAmount('');
      setRefundReason('');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Refund failed.'));
    } finally { setRefunding(false); }
  };

  const openTransfer = () => {
    setTransferFee(String(defaultTransferFee ?? 0));
    setSaveAsDefault(false);
    setRecipientMode('existing');
    setRecipientSystemId('');
    setNewName('');
    setNewPhone('');
    setNewGender('');
    setNewBirthdate('');
    setShowTransferModal(true);
  };

  const handleTransferPackage = async () => {
    const fee = Number(transferFee);
    if (!Number.isFinite(fee) || fee < 0) { toast.error(t('Enter a valid transfer fee')); return; }
    const payload = { transferFee: fee, saveAsDefault };
    if (recipientMode === 'existing') {
      if (!recipientSystemId.trim()) { toast.error(t('Enter a system ID')); return; }
      payload.recipientSystemId = recipientSystemId.trim();
    } else {
      if (!newName.trim() || !newPhone.trim()) { toast.error(t('Name and phone are required')); return; }
      payload.name = newName.trim();
      payload.phones = newPhone.trim();
      if (newGender) payload.gender = newGender;
      if (newBirthdate) payload.birthdate = newBirthdate;
    }
    setTransferring(true);
    try {
      const res = await transferMemberPackage(member._id, payload);
      toast.success(res.data.message ?? t('Package transferred'));
      if (saveAsDefault && res.data.defaultFeeSaved === false) {
        toast.error(t('The package moved, but the gym default fee was not saved.'));
      }
      setShowTransferModal(false);
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Transfer failed.'));
    } finally { setTransferring(false); }
  };

  const handleCancelPackage = async () => {
    const reason = cancelReason.trim();
    if (!reason) { toast.error(t('A cancellation reason is required')); return; }
    setCancelling(true);
    try {
      const res = await cancelMemberPackage(member._id, reason);
      toast.success(res.data.message ?? t('Package cancelled'));
      setShowCancelModal(false);
      setCancelReason('');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Cancellation failed.'));
    } finally { setCancelling(false); }
  };

  const handleReview = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await updatePackageExceptionStatus(confirm.id, confirm.status, confirm.reviewNote);
      toast.success(confirm.status === 'accepted' ? t('Package confirmed.') : t('Package declined.'));
      setConfirm(null);
      fetchPending();
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Action failed.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!pending) return;
    setActionLoading(true);
    try {
      await updatePackageExceptionStatus(pending._id, 'accepted');
      toast.success(t('Package confirmed.'));
      setShowAcceptModal(false);
      fetchPending();
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Action failed.'));
    } finally {
      setActionLoading(false);
    }
  };

  const purchasedPkg = (sub) => sub?.packageSnapshot ?? sub?.package;

  const subs    = member.subscriptions ?? [];
  const now = new Date();
  const activeSub = [...subs].reverse().find((s) => {
    if (isClosedSubscription(s) || !s?.startDate || !s?.endDate) return false;
    return new Date(s.startDate) <= now && new Date(s.endDate) > now;
  }) || null;
  const canUpgrade = canAddPackage && !loadingPending && !member.isBlocked && Boolean(activeSub);
  const lastSub = activeSub;
  const pkg     = purchasedPkg(lastSub);

  // Find upcoming/scheduled package (start date is in the future)
  const upcomingSub = subs.find(s => !isClosedSubscription(s) && new Date(s.startDate) > now);
  const upcomingPkg = purchasedPkg(upcomingSub);
  const cancellableSub = activeSub || upcomingSub;
  const lastSale = subs.at(-1);
  const lastSaleForfeited = isForfeitedCancellation(lastSale);
  const lastSaleTransferred = isTransferredAway(lastSale);

  const details = pkg ? [
    { label: t('Package'),          value: pkg.name },
    { label: t('Activity'),         value: pkg.activityType ? t(pkg.activityType) : pkg.activityType },
    { label: t('Duration'),         value: pkg.duration ? t(pkg.duration) : pkg.duration },
    { label: t('Created At'),       value: fmtDateTime(lastSub.createdAt) },
    { label: t('Start'),            value: fmtDate(lastSub.startDate) },
    { label: t('Expiry'),           value: fmtDate(lastSub.endDate) },
    { label: t('Price Paid'),       value: money(lastSub.pricePaid) },
    { label: t('Discount'),         value: lastSub.discountPercent ? `${lastSub.discountPercent}%` : t('None') },
    { label: t('Freeze Limit'),     value: t('{count} days', { count: pkg.freezeLimitDays ?? 0 }) },
    { label: t('Invitation Slots'), value: `${pkg.invitationLimit ?? 0}` },
    { label: t('Renewal Discount'), value: pkg.renewalDiscountPercent ? `${pkg.renewalDiscountPercent}%` : t('None') },
    { label: t('Exception'),        value: pkg.hasException ? t('Yes') : t('No') },
    { label: t('Type'),             value: lastSub.transferredFrom ? t('Received by transfer from {name}', { name: lastSub.transferredFromName || t('another member') }) : lastSub.isUpgrade ? t('Upgrade') : lastSub.isRenewal ? t('Renewal') : t('New subscription') },
    { label: t('Sold By'),          value: lastSub.createdBy?.name },
    { label: t('Status'),           value: <Badge status={member.status} /> },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!loadingPending && pending && (
        <Card style={{ borderColor: 'var(--amber-bd)' }}>
          <CardHeader title={t('Pending Package Assignment')}>
            <Badge status="pending" />
          </CardHeader>
          <Alert type="warning">
            {pending.notificationMessage ||
              (pending.hasException
                ? t('{user} added package {package} with exception to member {member}', { user: pending.proposedBy?.name, package: pending.name, member: member.name })
                : t('{user} requested package {package} for member {member}', { user: pending.proposedBy?.name, package: pending.name, member: member.name }))}
          </Alert>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>
            {pending.hasException
              ? t("This request includes custom exception terms and is waiting for Owner, GM, or Accountant approval before it is added to this member's profile.")
              : t("This package request is waiting for Owner, GM, or Accountant approval before it is added to this member's profile.")}
          </div>
          <PackageFormFields form={requestToForm(pending)} readOnly makeException={!!pending.hasException} />
          {pending.reason && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
              <span style={{ fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>{t('Reason:')} </span>
              {pending.reason}
            </div>
          )}
          {canReviewException && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Btn variant="success" size="sm" onClick={() => setShowAcceptModal(true)}>{t('Confirm')}</Btn>
              <Btn variant="danger" size="sm" onClick={() => setConfirm({ id: pending._id, status: 'rejected' })}>{t('Decline')}</Btn>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title={t('Active Package')}>
          <div data-walkthrough="package-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {activeSub && member.status !== 'guest' && (
              <Btn variant="outline" size="xs" onClick={() => setContractSub(activeSub)}><FileSignature size={14} aria-hidden /> {t('Contract')}</Btn>
            )}
            {canEditSubscription && (activeSub || upcomingSub) && !member.isBlocked && (
              <Btn variant="outline" size="xs" onClick={() => setEditSub(activeSub || upcomingSub)}>
                <Pencil size={14} aria-hidden /> {t('Edit')}
              </Btn>
            )}
            {canRefund && (member.subscriptions?.length ?? 0) > 0 && !lastSaleForfeited && !lastSaleTransferred && (
              <Btn variant="outline" size="xs" onClick={() => setShowRefundModal(true)}><Banknote size={14} aria-hidden /> {t('Refund')}</Btn>
            )}
            {canTransfer && activeSub && member.status !== 'frozen' && !member.isBlocked && (
              <span data-walkthrough="transfer-package-btn">
                <Btn variant="outline" size="xs" onClick={openTransfer}><ArrowLeftRight size={14} aria-hidden /> {t('Transfer')}</Btn>
              </span>
            )}
            {canRefund && cancellableSub && (
              <span data-walkthrough="cancel-package-btn">
                <Btn variant="outline" size="xs" onClick={() => setShowCancelModal(true)}><CircleOff size={14} aria-hidden /> {t('Cancel package')}</Btn>
              </span>
            )}
            {canUpgrade && (
              <Btn variant="outline" size="xs" onClick={() => { setPackageMode('upgrade'); setShowAddPackage(true); }}>{t('Upgrade')}</Btn>
            )}
            {canAddPackage && !loadingPending && !member.isBlocked && (
              <span data-walkthrough="add-package-btn">
                <Btn size="xs" onClick={() => { setPackageMode('add'); setShowAddPackage(true); }}>{requestOnly ? t('+ Request Package') : t('+ Add Package')}</Btn>
              </span>
            )}
          </div>
        </CardHeader>

        {/* Blocked overlay */}
        {member.isBlocked && pkg && (
          <div style={{
            padding: '10px 14px', borderRadius: 6, marginBottom: 12,
            background: 'var(--red-bg)', border: '1px solid var(--red-bd)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Ban size={18} color="var(--red)" aria-hidden />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
              {t('Package deactivated — member is blocked')}
            </span>
          </div>
        )}

        {!pkg || member.status === 'guest'
          ? <EmptyState message={t('No active package')} sub={requestOnly && !pending ? t('Submit a package request — Owner, GM, or Accountant must approve before it is assigned.') : canAssignPackageDirectly && !pending ? t('Click Add Package to assign a package to this member.') : t('No package assigned yet.')} />
          : <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1,
              background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
              opacity: member.isBlocked ? 0.5 : 1,
              pointerEvents: member.isBlocked ? 'none' : 'auto',
            }}>
              {details.map(d => (
                <div key={d.label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{d.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{d.value ?? '—'}</div>
                </div>
              ))}
            </div>
        }
      </Card>

      {/* Upcoming/Scheduled package */}
      {upcomingSub && upcomingPkg && (
        <Card style={{ borderInlineStart: '4px solid var(--amber)' }}>
          <CardHeader title={t('Next Package (Scheduled)')}>
            <Btn variant="outline" size="xs" onClick={() => setContractSub(upcomingSub)}><FileSignature size={14} aria-hidden /> {t('Contract')}</Btn>
          </CardHeader>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '8px 12px', background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
            borderRadius: 6,
          }}>
            <Calendar size={18} color="var(--amber)" aria-hidden />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>
              {t('Starts on {date}', { date: fmtDate(upcomingSub.startDate) })}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: t('Package'),  value: upcomingPkg.name },
              { label: t('Activity'), value: upcomingPkg.activityType ? t(upcomingPkg.activityType) : upcomingPkg.activityType },
              { label: t('Duration'), value: upcomingPkg.duration ? t(upcomingPkg.duration) : upcomingPkg.duration },
              { label: t('Starts'),   value: fmtDate(upcomingSub.startDate) },
              { label: t('Expires'),  value: fmtDate(upcomingSub.endDate) },
              { label: t('Price'),    value: money(upcomingSub.pricePaid) },
            ].map(d => (
              <div key={d.label} style={{ background: 'var(--card)', padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{d.value ?? '—'}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card noPad>
        <div style={{ padding: '14px 18px 0' }}>
          <CardHeader title={t('Subscription History ({count})', { count: subs.length })} />
        </div>
        {!subs.length ? <EmptyState message={t('No subscriptions on record')} /> :
          <Table headers={[t('Sub #'), t('Package'), t('Activity'), t('Duration'), t('Created At'), t('Start'), t('End'), t('Price'), t('Discount'), t('Exception'), t('Renewal'), t('Outcome')]}>
            {[...subs].reverse().map((s, i) => {
              const isRefunded = s.refundAmount > 0;
              const isTransferred = isTransferredAway(s);
              const isReceived = Boolean(s.transferredFrom);
              const isCancelled = isForfeitedCancellation(s);
              return (
              <tr key={s._id ?? i} className="tbl-row" style={{ borderBottom: '1px solid var(--border)', background: isRefunded || isCancelled || isTransferred ? 'var(--red-bg)' : 'transparent' }}>
                <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{s.subscriptionId ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{purchasedPkg(s)?.name ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{purchasedPkg(s)?.activityType ? t(purchasedPkg(s).activityType) : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{purchasedPkg(s)?.duration ? t(purchasedPkg(s).duration) : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDateTime(s.createdAt)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(s.startDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(s.endDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>
                  {isRefunded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--t4)', fontWeight: 400 }}>{money(s.pricePaid)}</span>
                      <span style={{ color: 'var(--green)' }}>{money(s.pricePaid - s.refundAmount)}</span>
                    </div>
                  ) : isReceived ? (
                    <span style={{ color: 'var(--t3)' }}>{t('Received')}</span>
                  ) : (
                    <span style={{ color: 'var(--green)' }}>{money(s.pricePaid)}</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{s.discountPercent ? `${s.discountPercent}%` : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{purchasedPkg(s)?.hasException ? t('Yes') : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{s.isUpgrade ? t('Upgrade') : s.isRenewal ? t('Yes') : '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  {isRefunded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700,
                        background: 'var(--red-bg)', color: 'var(--red)',
                        border: '1px solid var(--red-bd)',
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        <CornerDownLeft size={12} aria-hidden /> {t('Refunded')}
                      </span>
                      <span dir="ltr" style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, unicodeBidi: 'isolate' }}>−{money(s.refundAmount)}</span>
                    </div>
                  ) : isTransferred ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 220 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700,
                        background: 'var(--red-bg)', color: 'var(--red)',
                        border: '1px solid var(--red-bd)',
                        padding: '2px 8px', borderRadius: 4,
                        width: 'fit-content',
                      }}>
                        <ArrowLeftRight size={12} aria-hidden /> {t('Transferred')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.4 }}>
                        {t('To {name} · fee {fee}', { name: s.transferredToName || t('another person'), fee: money(s.transferFee ?? 0) })}
                      </span>
                    </div>
                  ) : isReceived ? (
                    <span style={{ fontSize: 11, color: 'var(--t2)' }}>
                      {t('From {name}', { name: s.transferredFromName || t('another member') })}
                    </span>
                  ) : isCancelled ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 220 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700,
                        background: 'var(--red-bg)', color: 'var(--red)',
                        border: '1px solid var(--red-bd)',
                        padding: '2px 8px', borderRadius: 4,
                        width: 'fit-content',
                      }}>
                        <CircleOff size={12} aria-hidden /> {t('Cancelled')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>{t('No refund')}</span>
                      <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.4 }}>{s.cancelReason}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--t4)' }}>—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </Table>
        }
      </Card>

      <Modal open={showTransferModal} onClose={() => !transferring && setShowTransferModal(false)} title={t('Transfer package')} size="md"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowTransferModal(false)} disabled={transferring}>{t('Back')}</Btn>
          <Btn size="sm" onClick={handleTransferPackage} disabled={transferring}>
            {transferring ? <Spinner size="sm" /> : t('Transfer package')}
          </Btn>
        </>}
      >
        <div data-walkthrough="transfer-package-form">
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {rich(t('Move the time left on {package} to someone who is not already a member. It keeps the same terms and ends on {date}. {member} loses the package and pays the transfer fee. The original sale is not refunded.'), {
            package: <strong><bdi>{pkg?.name || t('the current package')}</bdi></strong>,
            date: <strong>{fmtDate(activeSub?.endDate)}</strong>,
            member: <strong><bdi>{member.name}</bdi></strong>,
          })}
        </p>
        <Input
          label={t('Transfer fee ({currency})', { currency })}
          type="number"
          min="0"
          value={transferFee}
          onChange={e => setTransferFee(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)', margin: '8px 0 14px' }}>
          <input type="checkbox" checked={saveAsDefault} onChange={e => setSaveAsDefault(e.target.checked)} />
          {t('Save as gym default')}
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Btn type="button" size="xs" variant={recipientMode === 'existing' ? 'primary' : 'outline'} onClick={() => setRecipientMode('existing')}>{t('System ID')}</Btn>
          <Btn type="button" size="xs" variant={recipientMode === 'new' ? 'primary' : 'outline'} onClick={() => setRecipientMode('new')}>{t('New person')}</Btn>
        </div>
        {recipientMode === 'existing' ? (
          <Input
            label={t('System ID *')}
            value={recipientSystemId}
            onChange={e => setRecipientSystemId(e.target.value)}
            placeholder={t('S100 or 100')}
          />
        ) : (
          <div className="grid-2-form">
            <Input label={t('Full name *')} value={newName} onChange={e => setNewName(e.target.value)} />
            <Input label={t('Phone *')} value={newPhone} onChange={e => setNewPhone(e.target.value)} />
            <Select label={t('Gender')} value={newGender} onChange={e => setNewGender(e.target.value)}>
              <option value="">{t('— Select —')}</option>
              <option value="male">{t('Male')}</option>
              <option value="female">{t('Female')}</option>
            </Select>
            <Input label={t('Birthdate')} type="date" value={newBirthdate} onChange={e => setNewBirthdate(e.target.value)} />
          </div>
        )}
        </div>
      </Modal>

      {/* Refund Package Modal */}
      <Modal open={showRefundModal} onClose={() => !refunding && setShowRefundModal(false)} title={t('Refund Package')} size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowRefundModal(false)} disabled={refunding}>{t('Cancel')}</Btn>
          <Btn variant="danger" size="sm" onClick={handleRefundPackage} disabled={refunding}>
            {refunding ? <Spinner size="sm" /> : t('Confirm Refund')}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('Any amount cancels the last package. If an earlier package still covers today, the member stays active. Otherwise they become expired, or guest when this was their only package. Another refund on the same sale only returns money still left.')}
        </p>
        {(() => {
          const lastSub = member.subscriptions?.at(-1);
          const pricePaid = lastSub?.pricePaid ?? 0;
          const alreadyRefunded = lastSub?.refundAmount ?? 0;
          const maxRefund = pricePaid - alreadyRefunded;
          return (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Price Paid')}</span>
                <span style={{ fontWeight: 700 }}>{fmtNumber(pricePaid)} {currency}</span>
              </div>
              {alreadyRefunded > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Already Refunded')}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{fmtNumber(alreadyRefunded)} {currency}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>{t('Max Refundable')}</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtNumber(maxRefund)} {currency}</span>
              </div>
            </div>
          );
        })()}
        <Input label={t('Refund Amount ({currency}) *', { currency })} type="number" min="1"
          value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
          placeholder={t('Enter amount to refund')} />
        <Input label={t('Reason (optional)')}
          value={refundReason} onChange={e => setRefundReason(e.target.value)}
          placeholder={t('e.g. Member cancelled')} />
      </Modal>

      <Modal open={showCancelModal} onClose={() => !cancelling && setShowCancelModal(false)} title={t('Cancel package')} size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowCancelModal(false)} disabled={cancelling}>{t('Back')}</Btn>
          <Btn variant="danger" size="sm" onClick={handleCancelPackage} disabled={cancelling}>
            {cancelling ? <Spinner size="sm" /> : t('Cancel package')}
          </Btn>
        </>}
      >
        <div data-walkthrough="cancel-package-form">
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          {rich(t('Cancel {package} for {member}. Access ends immediately and the amount already paid stays on the sale. This member is not entitled to a refund.'), {
            package: <strong><bdi>{purchasedPkg(cancellableSub)?.name || t('the current package')}</bdi></strong>,
            member: <strong><bdi>{member.name}</bdi></strong>,
          })}
        </p>
        <Textarea label={t('Reason *')}
          value={cancelReason} onChange={e => setCancelReason(e.target.value)}
          maxLength={500}
          placeholder={t('e.g. Repeated misconduct at the gym')} />
        </div>
      </Modal>

      {showAddPackage && (
        <AddPackageModal
          open={showAddPackage}
          onClose={() => setShowAddPackage(false)}
          member={member}
          pending={pending}
          canReview={canReviewException}
          canAssignDirectly={canAssignPackageDirectly}
          canCreateCatalogPackage={canCreateCatalogPackage}
          upgrade={packageMode === 'upgrade'}
          onSuccess={(request) => {
            setShowAddPackage(false);
            if (request) {
              setPending(request);
            } else {
              fetchPending();
            }
            onRefresh?.();
          }}
          onReview={(id, status) => setConfirm({ id, status: status === 'declined' ? 'rejected' : status })}
        />
      )}

      <PackageAcceptModal
        request={pending}
        open={showAcceptModal && !!pending}
        onClose={() => setShowAcceptModal(false)}
        onConfirm={handleAccept}
        loading={actionLoading}
      />

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleReview}
        title={t('Decline Package')}
        message={t('Decline this package assignment? The requester will be notified.')}
        confirmLabel={t('Decline')}
        danger loading={actionLoading} />

      <ContractSignModal
        open={!!contractSub}
        onClose={() => setContractSub(null)}
        memberId={member.systemId ?? member._id}
        subscriptionId={contractSub?._id}
        defaultSignerName={member.name}
      />

      {editSub && (
        <EditPackageModal
          open={!!editSub}
          onClose={() => setEditSub(null)}
          member={member}
          subscription={editSub}
          onSuccess={() => {
            setEditSub(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function requestToForm(request) {
  return {
    basePackageId: request.basePackage?._id ?? '',
    name: request.name ?? '',
    activityType: request.activityType ?? 'gym',
    duration: request.duration ?? '1 month',
    price: String(request.price ?? ''),
    freezeLimitDays: String(request.freezeLimitDays ?? 0),
    invitationLimit: String(request.invitationLimit ?? 0),
    renewalDiscountPercent: String(request.renewalDiscountPercent ?? 0),
    description: request.description ?? '',
    pricePaid: String(request.pricePaid ?? ''),
    discountPercent: String(request.discountPercent ?? 0),
    startDate: request.startDate ? toLocalDateString(request.startDate) : '',
    reason: request.reason ?? '',
  };
}

const PACKAGE_TERM_KEYS = new Set([
  'name', 'activityType', 'duration', 'price',
  'freezeLimitDays', 'invitationLimit', 'renewalDiscountPercent',
]);

function PackageFormFields({ form, set, readOnly, makeException, allEditable, lockStartDate, showEndDate = false, showReason = false }) {
  const { t } = useI18n();
  const { currency = 'EGP' } = useTenant() || {};
  const fieldDisabled = (key) => {
    if (readOnly) return true;
    if (allEditable) return false;
    if (PACKAGE_TERM_KEYS.has(key)) return !makeException;
    return false;
  };

  return (
    <div className="grid-2">
      <Input label={t('Package Name')} value={form.name} onChange={e => set?.('name', e.target.value)} disabled={fieldDisabled('name')} readOnly={readOnly} />
      <Select label={t('Activity')} value={form.activityType} onChange={e => set?.('activityType', e.target.value)} disabled={fieldDisabled('activityType')} readOnly={readOnly}>
        {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{t(a)}</option>)}
      </Select>
      <Select label={t('Duration')} value={form.duration} onChange={e => set?.('duration', e.target.value)} disabled={fieldDisabled('duration')} readOnly={readOnly}>
        {DURATIONS.map(d => <option key={d} value={d}>{t(d)}</option>)}
      </Select>
      <Input label={t('Price ({currency})', { currency })} type="number" value={form.price} onChange={e => set?.('price', e.target.value)} disabled={fieldDisabled('price')} readOnly={readOnly} />
      <Input label={t('Price Paid ({currency})', { currency })} type="number" value={form.pricePaid} onChange={e => set?.('pricePaid', e.target.value)} disabled={fieldDisabled('pricePaid')} readOnly={readOnly} />
      <Input label={t('Discount %')} type="number" min="0" max="100" value={form.discountPercent} onChange={e => set?.('discountPercent', e.target.value)} disabled={fieldDisabled('discountPercent')} readOnly={readOnly} />
      <Input label={t('Freeze Limit (days)')} type="number" value={form.freezeLimitDays} onChange={e => set?.('freezeLimitDays', e.target.value)} disabled={fieldDisabled('freezeLimitDays')} readOnly={readOnly} />
      <Input label={t('Invitation Slots')} type="number" value={form.invitationLimit} onChange={e => set?.('invitationLimit', e.target.value)} disabled={fieldDisabled('invitationLimit')} readOnly={readOnly} />
      <Input label={t('Renewal Discount %')} type="number" min="0" max="100" value={form.renewalDiscountPercent} onChange={e => set?.('renewalDiscountPercent', e.target.value)} disabled={fieldDisabled('renewalDiscountPercent')} readOnly={readOnly} />
      <Input label={t('Start Date')} type="date" value={form.startDate} onChange={e => set?.('startDate', e.target.value)} hint={lockStartDate ? t('Upgrade starts today. The current package keeps its end date and price.') : allEditable && !showEndDate ? t('Defaults to current package end date if active, otherwise today') : undefined} disabled={lockStartDate || fieldDisabled('startDate')} readOnly={readOnly || lockStartDate} />
      {showEndDate && (
        <Input label={t('End Date')} type="date" value={form.endDate} onChange={e => set?.('endDate', e.target.value)} disabled={fieldDisabled('endDate')} readOnly={readOnly} />
      )}
      {!readOnly && (showReason || !allEditable) && (
        <div style={{ gridColumn: '1 / -1' }}>
          <Input label={t('Reason')} value={form.reason} onChange={e => set?.('reason', e.target.value)} placeholder={showReason ? t('Optional note for this edit') : t('Why is this exception needed?')} disabled={fieldDisabled('reason')} />
        </div>
      )}
    </div>
  );
}

function subscriptionToEditForm(subscription) {
  const pkg = subscription?.packageSnapshot ?? subscription?.package ?? {};
  return {
    ...EMPTY_FORM,
    name: pkg.name ?? '',
    activityType: pkg.activityType ?? 'gym',
    duration: pkg.duration ?? '1 month',
    price: String(pkg.price ?? ''),
    freezeLimitDays: String(pkg.freezeLimitDays ?? 0),
    invitationLimit: String(pkg.invitationLimit ?? 0),
    renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
    description: pkg.description ?? '',
    pricePaid: String(subscription?.pricePaid ?? ''),
    discountPercent: String(subscription?.discountPercent ?? 0),
    startDate: subscription?.startDate ? toLocalDateString(subscription.startDate) : '',
    endDate: subscription?.endDate ? toLocalDateString(subscription.endDate) : '',
    reason: '',
  };
}

function EditPackageModal({ open, onClose, member, subscription, onSuccess }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => subscriptionToEditForm(subscription));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setForm(subscriptionToEditForm(subscription));
  }, [open, subscription]);

  const set = (k, v) => setForm((f) => {
    const updated = { ...f, [k]: v };
    if (k === 'price' || k === 'discountPercent') {
      const price = Number(k === 'price' ? v : updated.price) || 0;
      const discount = Math.min(100, Math.max(0, Number(k === 'discountPercent' ? v : updated.discountPercent) || 0));
      updated.pricePaid = String(Math.round(price * (1 - discount / 100)));
    }
    return updated;
  });

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error(t('Package name is required.')); return; }
    if (!form.duration) { toast.error(t('Duration is required.')); return; }
    if (form.pricePaid === '' || form.pricePaid == null || isNaN(Number(form.pricePaid)) || Number(form.pricePaid) < 0) {
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

    const subscriptionKey = subscription._id ?? subscription.subscriptionId;
    setLoading(true);
    try {
      await updateMemberSubscription(member.systemId ?? member._id, subscriptionKey, {
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
      onSuccess?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to update package.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose?.()}
      title={t('Edit Package')}
      size="lg"
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>{t('Cancel')}</Btn>
        <Btn size="sm" onClick={handleSave} disabled={loading}>
          {loading ? <Spinner size="sm" /> : t('Save changes')}
        </Btn>
      </>}
    >
      <Alert type="info">
        {t('Changes apply to this membership only. Signed contracts cannot be edited.')}
      </Alert>
      <PackageFormFields form={form} set={set} allEditable showEndDate showReason />
    </Modal>
  );
}

function AddPackageModal({ open, onClose, member, pending, canReview = false, canAssignDirectly = false, canCreateCatalogPackage = false, onSuccess, onReview, upgrade = false }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const { currency = 'EGP' } = useTenant() || {};
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [makeException, setMakeException] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_PACKAGE_FORM);
  const [createErrors, setCreateErrors] = useState({});
  const [creatingPackage, setCreatingPackage] = useState(false);

  const loadPackages = useCallback(() => {
    return getPackages({ limit: 100 })
      .then(res => setPackages(res.data?.packages ?? []))
      .catch(() => toast.error(t('Failed to load packages.')));
  }, [t]);

  useLocationEffect(() => {
    if (!open) return;
    setMakeException(false);
    const defaultStart = upgrade ? toLocalDateString(new Date()) : defaultPackageStart(member);
    setForm({ ...EMPTY_FORM, startDate: defaultStart });
    setShowCreatePackage(false);
    setCreateForm(EMPTY_PACKAGE_FORM);
    setCreateErrors({});
    loadPackages();
  }, [open, loadPackages, member, upgrade]);

  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v };
    // Auto-calculate pricePaid whenever price or discountPercent changes
    if (k === 'price' || k === 'discountPercent') {
      const price = Number(k === 'price' ? v : updated.price) || 0;
      const discount = Math.min(100, Math.max(0, Number(k === 'discountPercent' ? v : updated.discountPercent) || 0));
      updated.pricePaid = String(Math.round(price * (1 - discount / 100)));
    }
    return updated;
  });

  const handlePackageChange = (id) => {
    const pkg = packages.find(p => p._id === id);
    if (!pkg) { set('basePackageId', id); return; }
    const discount = Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
    const computedPricePaid = String(Math.round(pkg.price * (1 - discount / 100)));
    setForm(f => ({
      ...f,
      basePackageId: id,
      name: pkg.name,
      activityType: pkg.activityType,
      duration: pkg.duration,
      price: String(pkg.price),
      freezeLimitDays: String(pkg.freezeLimitDays ?? 0),
      invitationLimit: String(pkg.invitationLimit ?? 0),
      renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
      description: pkg.description ?? '',
      pricePaid: computedPricePaid,
    }));
  };

  const handleCreateCatalogPackage = async () => {
    const errs = validatePackageForm(createForm);
    if (Object.keys(errs).length) { setCreateErrors(errs); return; }

    setCreatingPackage(true);
    try {
      const res = await createPackage(packageFormToPayload(createForm));
      const pkg = res.data?.package;
      toast.success(t('Package added to catalog.'));
      setShowCreatePackage(false);
      setCreateForm(EMPTY_PACKAGE_FORM);
      setCreateErrors({});
      await loadPackages();
      if (pkg?._id) {
        setForm(f => ({
          ...f,
          basePackageId: pkg._id,
          name: pkg.name,
          activityType: pkg.activityType,
          duration: pkg.duration,
          price: String(pkg.price),
          freezeLimitDays: String(pkg.freezeLimitDays ?? 0),
          invitationLimit: String(pkg.invitationLimit ?? 0),
          renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
          description: pkg.description ?? '',
          pricePaid: String(pkg.price),
        }));
      }
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed to create package.'));
    } finally {
      setCreatingPackage(false);
    }
  };

  const handleSalesManagerSubmit = async () => {
    if (!form.basePackageId) { toast.error(t('Select a package.')); return; }
    if (!form.name?.trim()) { toast.error(t('Package name is required.')); return; }
    if (form.pricePaid === '' || form.pricePaid == null || isNaN(Number(form.pricePaid)) || Number(form.pricePaid) < 0) {
      toast.error(t('Price paid must be a non-negative number.'));
      return;
    }
    if (form.discountPercent !== '' && (Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100)) {
      toast.error(t('Discount percent must be between 0 and 100.'));
      return;
    }
    if (form.startDate && isNaN(Date.parse(form.startDate))) {
      toast.error(t('Invalid start date.'));
      return;
    }
    if (makeException && !form.reason?.trim()) {
      toast.error(t('Please enter a reason for the exception.'));
      return;
    }

    setLoading(true);
    try {
      const res = await createPackageException({
        memberId: String(member.systemId ?? member._id),
        basePackageId: form.basePackageId,
        hasException: makeException,
        name: form.name.trim(),
        activityType: form.activityType,
        duration: form.duration,
        price: Number(form.price),
        freezeLimitDays: Number(form.freezeLimitDays) || 0,
        invitationLimit: Number(form.invitationLimit) || 0,
        renewalDiscountPercent: Number(form.renewalDiscountPercent) || 0,
        description: form.description || null,
        pricePaid: Number(form.pricePaid),
        discountPercent: Number(form.discountPercent) || 0,
        startDate: upgrade ? toLocalDateString(new Date()) : (form.startDate || undefined),
        reason: form.reason?.trim() || null,
        upgrade,
      });
      toast.success(upgrade ? t('Upgrade request sent for Owner, GM, or Accountant approval.') : t('Package request sent for Owner, GM, or Accountant approval.'));
      onSuccess(res.data?.request ?? null);
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAccountantSubmit = async () => {
    if (!form.basePackageId) { toast.error(t('Select a package.')); return; }
    if (!form.name?.trim()) { toast.error(t('Package name is required.')); return; }
    if (!form.duration) { toast.error(t('Duration is required.')); return; }
    if (form.pricePaid === '' || form.pricePaid == null || isNaN(Number(form.pricePaid)) || Number(form.pricePaid) <= 0) {
      toast.error(t('Price paid must be greater than zero.'));
      return;
    }
    if (form.discountPercent !== '' && (Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100)) {
      toast.error(t('Discount percent must be between 0 and 100.'));
      return;
    }
    if (form.startDate && isNaN(Date.parse(form.startDate))) {
      toast.error(t('Invalid start date.'));
      return;
    }

    setLoading(true);
    try {
      await assignPackage(member.systemId ?? member._id, {
        packageId: form.basePackageId,
        name: form.name.trim(),
        activityType: form.activityType,
        duration: form.duration,
        price: Number(form.price),
        freezeLimitDays: Number(form.freezeLimitDays) || 0,
        invitationLimit: Number(form.invitationLimit) || 0,
        renewalDiscountPercent: Number(form.renewalDiscountPercent) || 0,
        pricePaid: Number(form.pricePaid),
        discountPercent: Number(form.discountPercent) || 0,
        startDate: upgrade ? toLocalDateString(new Date()) : (form.startDate || undefined),
        upgrade,
      });
      toast.success(upgrade ? t('Package upgraded.') : t('Package assigned.'));
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('Failed.'));
    } finally {
      setLoading(false);
    }
  };

  // Reviewers (Accountant / Owner / GM): review a pending request before adding another
  if (pending && canReview) {
    return (
      <Modal open={open} onClose={onClose} title={t('Add Package — Review Request')} size="lg"
        footer={<Btn variant="ghost" size="sm" onClick={onClose}>{t('Close')}</Btn>}>
        <Alert type="warning">
          {pending.notificationMessage ||
            (pending.hasException
              ? t('{user} added package {package} with exception to member {member}', { user: pending.proposedBy?.name, package: pending.name, member: member.name })
              : t('{user} requested package {package} for member {member}', { user: pending.proposedBy?.name, package: pending.name, member: member.name }))}
        </Alert>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
          {rich(t('Proposed by {user} · Based on {package}'), { user: <strong><bdi>{pending.proposedBy?.name}</bdi></strong>, package: <strong><bdi>{pending.basePackage?.name}</bdi></strong> })}
          {pending.hasException ? ` · ${t('Exception terms')}` : ` · ${t('Standard catalog request')}`}
        </div>
        <PackageFormFields form={requestToForm(pending)} readOnly makeException={!!pending.hasException} />
        {pending.reason && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)' }}>
            <strong>{t('Reason:')}</strong> {pending.reason}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <Btn variant="success" size="sm" onClick={() => { onClose(); onReview(pending._id, 'accepted'); }}>{t('Confirm')}</Btn>
          <Btn variant="danger" size="sm" onClick={() => { onClose(); onReview(pending._id, 'declined'); }}>{t('Decline')}</Btn>
        </div>
      </Modal>
    );
  }

  // Accountant, Owner, or staff granted bypass: assign directly
  if (canAssignDirectly) {
    return (
      <Modal open={open} onClose={onClose} title={upgrade ? t('Upgrade Package') : t('Add Package')} size="lg"
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={onClose}>{t('Cancel')}</Btn>
            <Btn size="sm" onClick={handleAccountantSubmit} disabled={loading || !!pending || !form.basePackageId || !form.name?.trim() || !form.duration || form.pricePaid === ''}>
              {loading ? <Spinner size="sm" /> : upgrade ? t('Upgrade Package') : t('Assign Package')}
            </Btn>
          </>
        }>
        <div data-walkthrough="add-package-form">
        {pending && (
          <Alert type="warning">{t('This member already has a pending package request awaiting Owner, GM, or Accountant approval.')}</Alert>
        )}
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          {upgrade
            ? rich(t('Upgrade {member} to a new package starting today. The current package keeps its end date and price.'), { member: <strong><bdi>{member.name}</bdi></strong> })
            : rich(t('Assign a package to {member}. Select a base package to pre-fill, then enter or adjust all terms before assigning.'), { member: <strong><bdi>{member.name}</bdi></strong> })}
        </p>
        <Select
          label={t('Base Package *')}
          value={form.basePackageId}
          onChange={e => handlePackageChange(e.target.value)}
          placeholder={t('Search packages…')}
          initialLimit={5}
        >
          {packages.map(p => <option key={p._id} value={p._id}>{p.name} — {currency} {fmtNumber(p.price)} ({p.duration ? t(p.duration) : p.duration})</option>)}
        </Select>
        {form.basePackageId && (
          <div style={{ marginTop: 16 }}>
            <PackageFormFields form={form} set={set} allEditable lockStartDate={upgrade} />
          </div>
        )}
        </div>
      </Modal>
    );
  }

  // Sales / Sales Manager: request only — never assigns directly unless granted bypass above
  return (
    <>
    <Modal open={open} onClose={onClose} title={upgrade ? t('Request Upgrade') : t('Request Package')} size="lg"
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>{t('Cancel')}</Btn>
          <Btn size="sm" onClick={handleSalesManagerSubmit} disabled={loading || !form.basePackageId || pending}>
            {loading ? <Spinner size="sm" /> : upgrade ? t('Submit Upgrade') : t('Submit for Approval')}
          </Btn>
        </>
      }>
      <div data-walkthrough="add-package-form">
      {pending && (
        <Alert type="warning">{t('This member already has a pending package request awaiting Owner, GM, or Accountant approval.')}</Alert>
      )}
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
        {upgrade
          ? rich(t('Request an upgrade for {member} starting today. An Owner, GM, or Accountant must approve it. The current package keeps its end date and price.'), { member: <strong><bdi>{member.name}</bdi></strong> })
          : rich(t('Request a package for {member}. An Owner, GM, or Accountant must approve before it is assigned. Turn on {exception} to customize terms.'), { member: <strong><bdi>{member.name}</bdi></strong>, exception: <strong>{t('Make Exception')}</strong> })}
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: form.basePackageId ? 0 : 16 }}>
        <div style={{ flex: 1 }}>
          <Select
            label={t('Package *')}
            value={form.basePackageId}
            onChange={e => handlePackageChange(e.target.value)}
            disabled={!!pending}
            placeholder={t('Search packages…')}
            initialLimit={5}
          >
            {packages.map(p => <option key={p._id} value={p._id}>{p.name} — {currency} {fmtNumber(p.price)} ({p.duration ? t(p.duration) : p.duration})</option>)}
          </Select>
        </div>
        {canCreateCatalogPackage && !pending && (
          <Btn variant="outline" size="sm" onClick={() => setShowCreatePackage(true)} style={{ marginBottom: 1 }}>
            {t('+ New Package')}
          </Btn>
        )}
      </div>

      {form.basePackageId && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <Switch
              label={t('Make Exception')}
              hint={makeException ? t('Fields are editable. Custom terms will be flagged as an exception.') : t('Standard package terms — still requires Owner, GM, or Accountant approval.')}
              checked={makeException}
              onChange={setMakeException}
              disabled={!!pending}
            />
          </div>
          <PackageFormFields form={form} set={set} readOnly={false} makeException={makeException} lockStartDate={upgrade} />
        </div>
      )}
      </div>
    </Modal>
    {canCreateCatalogPackage && (
      <CreateCatalogPackageModal
        open={showCreatePackage}
        onClose={() => setShowCreatePackage(false)}
        form={createForm}
        onChange={setCreateForm}
        errors={createErrors}
        onSubmit={handleCreateCatalogPackage}
        loading={creatingPackage}
      />
    )}
    </>
  );
}

function CreateCatalogPackageModal({ open, onClose, form, onChange, errors, onSubmit, loading }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t('New Package')} size="md"
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>{t('Cancel')}</Btn>
          <Btn size="sm" onClick={onSubmit} disabled={loading}>
            {loading ? <Spinner size="sm" /> : t('Save to Catalog')}
          </Btn>
        </>
      }>
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14 }}>
        {t('Create a new package in the catalog. It will be available for all members after saving.')}
      </p>
      <CatalogPackageForm form={form} onChange={onChange} errors={errors} />
    </Modal>
  );
}
