import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Badge, Table, EmptyState, fmtDate, fmtDateTime, Btn, Modal, Input, Select, Spinner, ConfirmDialog, Switch, Alert, toLocalDateString } from '../../../components/ui';
import { getPackages, getMemberPendingException, createPackageException, updatePackageExceptionStatus, assignPackage, createPackage, addPTSessions, refundMember, refundPTSessions } from '../../../api/endpoints';
import api from '../../../api/axios';
import CatalogPackageForm, { EMPTY_PACKAGE_FORM, validatePackageForm, packageFormToPayload } from '../../../components/PackageForm';
import PackageAcceptModal from '../../../components/accounting/PackageAcceptModal';
import { useTenant } from '../../../context/TenantContext';

const ACTIVITY_TYPES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];
const DURATIONS = ['1 month', '3 months', '6 months', '1 year'];

const EMPTY_FORM = {
  basePackageId: '', name: '', activityType: 'gym', duration: '1 month',
  price: '', freezeLimitDays: '0', invitationLimit: '0', renewalDiscountPercent: '0',
  description: '', pricePaid: '', discountPercent: '0', startDate: '', reason: '',
};

export default function PackagesTab({ member, user, onRefresh }) {
  const [tab, setTab] = useState('packages'); // 'packages' | 'pt-sessions'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'packages', label: 'Packages' },
          { id: 'pt-sessions', label: 'Private Sessions' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--navy)' : 'transparent'}`,
            marginBottom: -1,
            color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'color 0.12s',
          }}
            onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = 'var(--t2)'; }}
            onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = 'var(--t3)'; }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'packages' && <PackagesContent member={member} user={user} onRefresh={onRefresh} />}
      {tab === 'pt-sessions' && <PTSessionsContent member={member} user={user} onRefresh={onRefresh} />}
    </div>
  );
}

// ── Private Sessions Sub-tab ──────────────────────────────────────────────────
function PTSessionsContent({ member, user, onRefresh }) {
  const { currency = 'EGP' } = useTenant() || {};
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

  const canAdd = ['Owner', 'Accountant'].includes(user?.role);
  const canRefund = ['Owner', 'Accountant'].includes(user?.role);

  const ptSubs = member.pt_subscriptions ?? [];
  const latestSub = ptSubs.at(-1);
  // Consider sessions "active" only if the last PT subscription is not refunded
  const isLatestRefunded = latestSub?.refunded === true || (latestSub?.refundAmount ?? 0) > 0;
  const totalSessions = isLatestRefunded ? 0 : (member.PT_sessions ?? 0);
  const usedSessions  = isLatestRefunded ? 0 : (member.used_PT_sessions ?? 0);
  const remaining     = totalSessions - usedSessions;
  const ptStart = member.PT_sessions_startDate;
  const ptEnd   = member.PT_sessions_expDate;

  const handleAdd = async () => {
    const num = Number(sessions);
    if (!num || num <= 0 || !Number.isInteger(num)) { toast.error('Enter a valid whole number of sessions'); return; }
    const months = Number(durationMonths);
    if (!months || months <= 0) { toast.error('Enter a valid duration in months'); return; }
    if (!startDate || isNaN(Date.parse(startDate))) { toast.error('Valid start date is required'); return; }
    const paid = Number(pricePaid);
    if (pricePaid !== '' && (isNaN(paid) || paid < 0)) { toast.error('Price paid must be a non-negative number'); return; }
    setLoading(true);
    try {
      await addPTSessions(member.systemId ?? member._id, {
        numberOfSessions: num,
        startDate,
        durationMonths: months,
        pricePaid: Number(pricePaid) || 0,
      });
      toast.success(`Added ${num} private session(s)`);
      setSessions('');
      setDurationMonths('');
      setPricePaid('');
      setShowAddModal(false);
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to add sessions');
    } finally { setLoading(false); }
  };

  const handlePTRefund = async () => {
    const amount = Number(ptRefundAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid refund amount'); return; }
    const lastPTSub = member.pt_subscriptions?.at(-1);
    const maxRefund = (lastPTSub?.pricePaid ?? 0) - (lastPTSub?.refundAmount ?? 0);
    if (amount > maxRefund) {
      toast.error(`Refund amount cannot exceed maximum refundable (${currency} ${maxRefund})`);
      return;
    }
    setPTRefunding(true);
    try {
      const res = await refundPTSessions(member._id, amount, ptRefundReason.trim() || undefined);
      toast.success(res.data.message ?? 'PT sessions refund issued successfully');
      setShowPTRefundModal(false);
      setPTRefundAmount('');
      setPTRefundReason('');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'PT refund failed.');
    } finally { setPTRefunding(false); }
  };

  const activeDetails = totalSessions > 0 ? [
    { label: 'Total Sessions', value: totalSessions },
    { label: 'Used', value: usedSessions },
    { label: 'Remaining', value: remaining },
    { label: 'Start', value: ptStart ? fmtDate(ptStart) : '—' },
    { label: 'Expiry', value: ptEnd ? fmtDate(ptEnd) : '—' },
    { label: 'Duration', value: latestSub ? `${latestSub.durationMonths} month${latestSub.durationMonths !== 1 ? 's' : ''}` : '—' },
    { label: 'Price Paid', value: latestSub?.pricePaid ? `${currency} ${latestSub.pricePaid}` : '—' },
    { label: 'Status', value: <Badge status={remaining > 0 && ptEnd && new Date(ptEnd) > new Date() ? 'active' : 'expired'} /> },
    { label: 'Coach', value: member.current_couch?.name ?? '—' },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Active Sessions Card */}
      <Card>
        <CardHeader title="Active Private Sessions">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {canRefund && (member.pt_subscriptions?.length ?? 0) > 0 && (
              <Btn variant="outline" size="xs" onClick={() => setShowPTRefundModal(true)}>💸 Refund</Btn>
            )}
            {canAdd && (
              <Btn size="xs" onClick={() => setShowAddModal(true)}>+ Add Sessions</Btn>
            )}
          </div>
        </CardHeader>

        {totalSessions === 0
          ? <EmptyState message="No active private sessions" sub={canAdd ? 'Click + Add Sessions to assign PT sessions to this member.' : 'No private sessions assigned yet.'} />
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
          <CardHeader title={`Session History (${ptSubs.length})`} />
        </div>
        {!ptSubs.length ? <EmptyState message="No session records yet" /> :
          <Table headers={['#', 'Sessions', 'Duration', 'Start', 'Expiry', 'Price Paid', 'Coach', 'Date Added', 'Refund']}>
            {[...ptSubs].reverse().map((sub, i) => {
              const isPTRefunded = sub.refunded === true || (sub.refundAmount ?? 0) > 0;
              return (
              <tr key={sub._id ?? i} className="tbl-row" style={{ borderBottom: '1px solid var(--border)', background: isPTRefunded ? 'var(--red-bg)' : 'transparent' }}>
                <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{ptSubs.length - i}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{sub.sessions}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{sub.durationMonths} month{sub.durationMonths !== 1 ? 's' : ''}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(sub.startDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(sub.endDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>
                  {isPTRefunded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--t4)', fontWeight: 400 }}>{sub.pricePaid ? `${currency} ${sub.pricePaid}` : '—'}</span>
                      <span style={{ color: 'var(--green)' }}>{currency} {(sub.pricePaid ?? 0) - (sub.refundAmount ?? 0)}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--green)' }}>{sub.pricePaid ? `${currency} ${sub.pricePaid}` : '—'}</span>
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
                      }}>↩ Refunded</span>
                      {sub.refundAmount > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>−EGP {sub.refundAmount}</span>
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
      <Modal open={showAddModal} onClose={() => !loading && setShowAddModal(false)} title="Add Private Sessions" size="md"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowAddModal(false)} disabled={loading}>Cancel</Btn>
          <Btn size="sm" onClick={handleAdd} disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Add Sessions'}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          Add PT sessions to <strong>{member.name}</strong>. Duration in months (e.g. 1, 2.5, 3). Half months = 15 days.
        </p>
        <div className="grid-2-form">
          <Input
            label="Number of Sessions *"
            type="number" min="1"
            value={sessions}
            onChange={e => setSessions(e.target.value)}
            placeholder="e.g. 10"
          />
          <Input
            label="Start Date *"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <Input
            label="Duration (months) *"
            type="number" min="0.5" step="0.5"
            value={durationMonths}
            onChange={e => setDurationMonths(e.target.value)}
            placeholder="e.g. 2.5"
          />
          <Input
            label={`Price Paid (${currency})`}
            type="number" min="0"
            value={pricePaid}
            onChange={e => setPricePaid(e.target.value)}
            placeholder="e.g. 500"
          />
        </div>
      </Modal>

      {/* PT Refund Modal */}
      <Modal open={showPTRefundModal} onClose={() => !ptRefunding && setShowPTRefundModal(false)} title="Refund Private Sessions" size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowPTRefundModal(false)} disabled={ptRefunding}>Cancel</Btn>
          <Btn variant="danger" size="sm" onClick={handlePTRefund} disabled={ptRefunding}>
            {ptRefunding ? <Spinner size="sm" /> : 'Confirm Refund'}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          Refund will be recorded against the last PT subscription for <strong>{member.name}</strong>.
        </p>
        {(() => {
          const lastPTSub = member.pt_subscriptions?.at(-1);
          const pricePaidVal = lastPTSub?.pricePaid ?? 0;
          const alreadyRefunded = lastPTSub?.refundAmount ?? 0;
          const maxRefund = pricePaidVal - alreadyRefunded;
          return (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Price Paid</span>
                <span style={{ fontWeight: 700 }}>{pricePaidVal} EGP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Sessions</span>
                <span style={{ fontWeight: 700 }}>{lastPTSub?.sessions ?? 0}</span>
              </div>
              {alreadyRefunded > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Already Refunded</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{alreadyRefunded} EGP</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Max Refundable</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{maxRefund} EGP</span>
              </div>
            </div>
          );
        })()}
        <Input
          label={`Refund Amount (${currency}) *`}
          type="number" min="1"
          value={ptRefundAmount}
          onChange={e => setPTRefundAmount(e.target.value)}
          placeholder="Enter amount to refund"
        />
        <Input
          label="Reason (optional)"
          value={ptRefundReason}
          onChange={e => setPTRefundReason(e.target.value)}
          placeholder="e.g. Member cancelled sessions"
        />
      </Modal>
    </div>
  );
}

// ── Packages Sub-tab (original content) ───────────────────────────────────────
function PackagesContent({ member, user, onRefresh }) {
  const { currency = 'EGP' } = useTenant() || {};
  const [pending, setPending] = useState(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Refund package
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount]       = useState('');
  const [refundReason, setRefundReason]       = useState('');
  const [refunding, setRefunding]             = useState(false);

  const isSalesManager = user?.role === 'Sales Manager';
  const isAccountant = user?.role === 'Accountant';
  const isOwner = user?.role === 'Owner';
  const isGM = user?.role === 'General Manager';
  const canAddPackage = isSalesManager || isAccountant || isOwner || isGM;
  const canRefund = isOwner || isAccountant || isGM;
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
    if (!amount || amount <= 0) { toast.error('Enter a valid refund amount'); return; }
    const lastSub = member.subscriptions?.at(-1);
    const maxRefund = (lastSub?.pricePaid ?? 0) - (lastSub?.refundAmount ?? 0);
    if (amount > maxRefund) {
      toast.error(`Refund amount cannot exceed maximum refundable (${currency} ${maxRefund})`);
      return;
    }
    setRefunding(true);
    try {
      const res = await refundMember(member._id, amount, refundReason.trim() || undefined);
      toast.success(res.data.message ?? 'Refund issued successfully');
      setShowRefundModal(false);
      setRefundAmount('');
      setRefundReason('');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Refund failed.');
    } finally { setRefunding(false); }
  };

  const handleReview = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await updatePackageExceptionStatus(confirm.id, confirm.status, confirm.reviewNote);
      toast.success(`Package ${confirm.status === 'accepted' ? 'confirmed' : 'declined'}.`);
      setConfirm(null);
      fetchPending();
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!pending) return;
    setActionLoading(true);
    try {
      await updatePackageExceptionStatus(pending._id, 'accepted');
      toast.success('Package confirmed.');
      setShowAcceptModal(false);
      fetchPending();
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const purchasedPkg = (sub) => sub?.packageSnapshot ?? sub?.package;

  const subs    = member.subscriptions ?? [];
  // Show the currently active subscription (startDate <= now <= endDate), fallback to last one
  const now = new Date();
  const activeSub = subs.find(s => 
    new Date(s.startDate) <= now && 
    new Date(s.endDate) >= now && 
    !s.refunded && 
    !s.cancelled && 
    s.subscriptionStatus !== 'cancelled'
  ) || subs.at(-1);
  const lastSub = activeSub;
  const pkg     = purchasedPkg(lastSub);

  // Find upcoming/scheduled package (start date is in the future)
  const upcomingSub = subs.find(s => new Date(s.startDate) > now);
  const upcomingPkg = purchasedPkg(upcomingSub);

  const details = pkg ? [
    { label: 'Package',          value: pkg.name },
    { label: 'Activity',         value: pkg.activityType },
    { label: 'Duration',         value: pkg.duration },
    { label: 'Created At',       value: fmtDateTime(lastSub.createdAt) },
    { label: 'Start',            value: fmtDate(lastSub.startDate) },
    { label: 'Expiry',           value: fmtDate(lastSub.endDate) },
    { label: 'Price Paid',       value: `${currency} ${lastSub.pricePaid}` },
    { label: 'Discount',         value: lastSub.discountPercent ? `${lastSub.discountPercent}%` : 'None' },
    { label: 'Freeze Limit',     value: `${pkg.freezeLimitDays ?? 0} days` },
    { label: 'Invitation Slots', value: `${pkg.invitationLimit ?? 0}` },
    { label: 'Renewal Discount', value: pkg.renewalDiscountPercent ? `${pkg.renewalDiscountPercent}%` : 'None' },
    { label: 'Exception',        value: pkg.hasException ? 'Yes' : 'No' },
    { label: 'Type',             value: lastSub.isRenewal ? 'Renewal' : 'New subscription' },
    { label: 'Sold By',          value: lastSub.createdBy?.name },
    { label: 'Status',           value: <Badge status={member.status} /> },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!loadingPending && pending && (
        <Card style={{ borderColor: 'var(--amber-bd)' }}>
          <CardHeader title="Pending Package Assignment">
            <Badge status="pending" />
          </CardHeader>
          <Alert type="warning">
            {pending.notificationMessage ||
              (pending.hasException
                ? `${pending.proposedBy?.name} added package ${pending.name} with exception to member ${member.name}`
                : `${pending.proposedBy?.name} requested package ${pending.name} for member ${member.name}`)}
          </Alert>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>
            {pending.hasException
              ? 'This request includes custom exception terms and is waiting for accountant approval before it is added to this member\'s profile.'
              : 'This package request is waiting for accountant approval before it is added to this member\'s profile.'}
          </div>
          <PackageFormFields form={requestToForm(pending)} readOnly makeException={!!pending.hasException} />
          {pending.reason && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
              <span style={{ fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>Reason: </span>
              {pending.reason}
            </div>
          )}
          {isAccountant && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Btn variant="success" size="sm" onClick={() => setShowAcceptModal(true)}>Confirm</Btn>
              <Btn variant="danger" size="sm" onClick={() => setConfirm({ id: pending._id, status: 'rejected' })}>Decline</Btn>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Active Package">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {canRefund && (member.subscriptions?.length ?? 0) > 0 && (
              <Btn variant="outline" size="xs" onClick={() => setShowRefundModal(true)}>💸 Refund</Btn>
            )}
            {canAddPackage && !loadingPending && !member.isBlocked && (
              <Btn size="xs" onClick={() => setShowAddPackage(true)}>{isSalesManager ? '+ Request Package' : '+ Add Package'}</Btn>
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
            <span style={{ fontSize: 16 }}>🚫</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
              Package deactivated — member is blocked
            </span>
          </div>
        )}

        {!pkg || member.status === 'guest'
          ? <EmptyState message="No active package" sub={isSalesManager && !pending ? 'Submit a package request — the accountant must approve before it is assigned.' : isAccountant && !pending ? 'Click Add Package to assign a package to this member.' : 'No package assigned yet.'} />
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
        <Card style={{ borderLeft: '4px solid var(--amber)' }}>
          <CardHeader title="Next Package (Scheduled)" />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '8px 12px', background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
            borderRadius: 6,
          }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>
              Starts on {fmtDate(upcomingSub.startDate)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: 'Package',  value: upcomingPkg.name },
              { label: 'Activity', value: upcomingPkg.activityType },
              { label: 'Duration', value: upcomingPkg.duration },
              { label: 'Starts',   value: fmtDate(upcomingSub.startDate) },
              { label: 'Expires',  value: fmtDate(upcomingSub.endDate) },
              { label: 'Price',    value: `${currency} ${upcomingSub.pricePaid}` },
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
          <CardHeader title={`Subscription History (${subs.length})`} />
        </div>
        {!subs.length ? <EmptyState message="No subscriptions on record" /> :
          <Table headers={['Sub #', 'Package', 'Activity', 'Duration', 'Created At', 'Start', 'End', 'Price', 'Discount', 'Exception', 'Renewal', 'Refund']}>
            {[...subs].reverse().map((s, i) => {
              const isRefunded = s.refundAmount > 0;
              return (
              <tr key={s._id ?? i} className="tbl-row" style={{ borderBottom: '1px solid var(--border)', background: isRefunded ? 'var(--red-bg)' : 'transparent' }}>
                <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{s.subscriptionId ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{purchasedPkg(s)?.name ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{purchasedPkg(s)?.activityType ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{purchasedPkg(s)?.duration ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDateTime(s.createdAt)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(s.startDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDate(s.endDate)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>
                  {isRefunded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--t4)', fontWeight: 400 }}>EGP {s.pricePaid}</span>
                      <span style={{ color: 'var(--green)' }}>EGP {s.pricePaid - s.refundAmount}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--green)' }}>EGP {s.pricePaid}</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{s.discountPercent ? `${s.discountPercent}%` : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{purchasedPkg(s)?.hasException ? 'Yes' : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{s.isRenewal ? 'Yes' : '—'}</td>
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
                        ↩ Refunded
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>−EGP {s.refundAmount}</span>
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

      {/* Refund Package Modal */}
      <Modal open={showRefundModal} onClose={() => !refunding && setShowRefundModal(false)} title="Refund Package" size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowRefundModal(false)} disabled={refunding}>Cancel</Btn>
          <Btn variant="danger" size="sm" onClick={handleRefundPackage} disabled={refunding}>
            {refunding ? <Spinner size="sm" /> : 'Confirm Refund'}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          Refund will be deducted from the last subscription's revenue. Member status will be set back to <strong>guest</strong>.
        </p>
        {(() => {
          const lastSub = member.subscriptions?.at(-1);
          const pricePaid = lastSub?.pricePaid ?? 0;
          const alreadyRefunded = lastSub?.refundAmount ?? 0;
          const maxRefund = pricePaid - alreadyRefunded;
          return (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Price Paid</span>
                <span style={{ fontWeight: 700 }}>{pricePaid} EGP</span>
              </div>
              {alreadyRefunded > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Already Refunded</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{alreadyRefunded} EGP</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Max Refundable</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{maxRefund} {currency}</span>
              </div>
            </div>
          );
        })()}
        <Input label={`Refund Amount (${currency}) *`} type="number" min="1"
          value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
          placeholder="Enter amount to refund" />
        <Input label="Reason (optional)"
          value={refundReason} onChange={e => setRefundReason(e.target.value)}
          placeholder="e.g. Member cancelled" />
      </Modal>

      {showAddPackage && (
        <AddPackageModal
          open={showAddPackage}
          onClose={() => setShowAddPackage(false)}
          member={member}
          pending={pending}
          isSalesManager={isSalesManager}
          isAccountant={isAccountant}
          isOwner={isOwner}
          onSuccess={() => { setShowAddPackage(false); fetchPending(); onRefresh?.(); }}
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
        title="Decline Package"
        message="Decline this package assignment? The sales manager will be notified."
        confirmLabel="Decline"
        danger loading={actionLoading} />
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

function PackageFormFields({ form, set, readOnly, makeException, allEditable }) {
  const { currency = 'EGP' } = useTenant() || {};
  const fieldDisabled = (key) => {
    if (readOnly) return true;
    if (allEditable) return false;
    if (PACKAGE_TERM_KEYS.has(key)) return !makeException;
    return false;
  };

  return (
    <div className="grid-2">
      <Input label="Package Name" value={form.name} onChange={e => set?.('name', e.target.value)} disabled={fieldDisabled('name')} readOnly={readOnly} />
      <Select label="Activity" value={form.activityType} onChange={e => set?.('activityType', e.target.value)} disabled={fieldDisabled('activityType')} readOnly={readOnly}>
        {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </Select>
      <Select label="Duration" value={form.duration} onChange={e => set?.('duration', e.target.value)} disabled={fieldDisabled('duration')} readOnly={readOnly}>
        {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
      </Select>
      <Input label={`Price (${currency})`} type="number" value={form.price} onChange={e => set?.('price', e.target.value)} disabled={fieldDisabled('price')} readOnly={readOnly} />
      <Input label={`Price Paid (${currency})`} type="number" value={form.pricePaid} onChange={e => set?.('pricePaid', e.target.value)} disabled={fieldDisabled('pricePaid')} readOnly={readOnly} />
      <Input label="Discount %" type="number" min="0" max="100" value={form.discountPercent} onChange={e => set?.('discountPercent', e.target.value)} disabled={fieldDisabled('discountPercent')} readOnly={readOnly} />
      <Input label="Freeze Limit (days)" type="number" value={form.freezeLimitDays} onChange={e => set?.('freezeLimitDays', e.target.value)} disabled={fieldDisabled('freezeLimitDays')} readOnly={readOnly} />
      <Input label="Invitation Slots" type="number" value={form.invitationLimit} onChange={e => set?.('invitationLimit', e.target.value)} disabled={fieldDisabled('invitationLimit')} readOnly={readOnly} />
      <Input label="Renewal Discount %" type="number" min="0" max="100" value={form.renewalDiscountPercent} onChange={e => set?.('renewalDiscountPercent', e.target.value)} disabled={fieldDisabled('renewalDiscountPercent')} readOnly={readOnly} />
      <Input label="Start Date" type="date" value={form.startDate} onChange={e => set?.('startDate', e.target.value)} hint={allEditable ? 'Defaults to current package end date if active, otherwise today' : undefined} disabled={fieldDisabled('startDate')} readOnly={readOnly} />
      {!readOnly && !allEditable && (
        <div style={{ gridColumn: '1 / -1' }}>
          <Input label="Reason" value={form.reason} onChange={e => set?.('reason', e.target.value)} placeholder="Why is this exception needed?" disabled={fieldDisabled('reason')} />
        </div>
      )}
    </div>
  );
}

function AddPackageModal({ open, onClose, member, pending, isSalesManager, isAccountant, isOwner, onSuccess, onReview }) {
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
      .catch(() => toast.error('Failed to load packages.'));
  }, []);

  useEffect(() => {
    if (!open) return;
    setMakeException(false);
    // Pre-fill start date with current package end date if active
    const currentSub = member.subscriptions?.at(-1);
    const currentEnd = currentSub?.endDate ? new Date(currentSub.endDate) : null;
    const defaultStart = (currentEnd && currentEnd > new Date()) ? toLocalDateString(currentEnd) : '';
    setForm({ ...EMPTY_FORM, startDate: defaultStart });
    setShowCreatePackage(false);
    setCreateForm(EMPTY_PACKAGE_FORM);
    setCreateErrors({});
    loadPackages();
  }, [open, loadPackages]);

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
      toast.success('Package added to catalog.');
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
      toast.error(e.response?.data?.message ?? 'Failed to create package.');
    } finally {
      setCreatingPackage(false);
    }
  };

  const handleSalesManagerSubmit = async () => {
    if (!form.basePackageId) { toast.error('Select a package.'); return; }
    if (!form.name?.trim()) { toast.error('Package name is required.'); return; }
    if (form.pricePaid === '' || form.pricePaid == null || isNaN(Number(form.pricePaid)) || Number(form.pricePaid) < 0) {
      toast.error('Price paid must be a non-negative number.');
      return;
    }
    if (form.discountPercent !== '' && (Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100)) {
      toast.error('Discount percent must be between 0 and 100.');
      return;
    }
    if (form.startDate && isNaN(Date.parse(form.startDate))) {
      toast.error('Invalid start date.');
      return;
    }
    if (makeException && !form.reason?.trim()) {
      toast.error('Please enter a reason for the exception.');
      return;
    }

    setLoading(true);
    try {
      await createPackageException({
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
        startDate: form.startDate || undefined,
        reason: form.reason?.trim() || null,
      });
      toast.success('Package request sent to accountant for approval.');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountantSubmit = async () => {
    if (!form.basePackageId) { toast.error('Select a package.'); return; }
    if (!form.name?.trim()) { toast.error('Package name is required.'); return; }
    if (!form.duration) { toast.error('Duration is required.'); return; }
    if (form.pricePaid === '' || form.pricePaid == null || isNaN(Number(form.pricePaid)) || Number(form.pricePaid) <= 0) {
      toast.error('Price paid must be greater than zero.');
      return;
    }
    if (form.discountPercent !== '' && (Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100)) {
      toast.error('Discount percent must be between 0 and 100.');
      return;
    }
    if (form.startDate && isNaN(Date.parse(form.startDate))) {
      toast.error('Invalid start date.');
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
        startDate: form.startDate || undefined,
      });
      toast.success('Package assigned.');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  // Accountant or Owner: review pending request or assign directly
  if (isAccountant || isOwner) {
    if (pending) {
      return (
        <Modal open={open} onClose={onClose} title="Add Package — Review Request" size="lg"
          footer={<Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>}>
          <Alert type="warning">
            {pending.notificationMessage ||
              (pending.hasException
                ? `${pending.proposedBy?.name} added package ${pending.name} with exception to member ${member.name}`
                : `${pending.proposedBy?.name} requested package ${pending.name} for member ${member.name}`)}
          </Alert>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
            Proposed by <strong>{pending.proposedBy?.name}</strong> · Based on <strong>{pending.basePackage?.name}</strong>
            {pending.hasException ? ' · Exception terms' : ' · Standard catalog request'}
          </div>
          <PackageFormFields form={requestToForm(pending)} readOnly makeException={!!pending.hasException} />
          {pending.reason && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)' }}>
              <strong>Reason:</strong> {pending.reason}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <Btn variant="success" size="sm" onClick={() => { onClose(); onReview(pending._id, 'accepted'); }}>Confirm</Btn>
            <Btn variant="danger" size="sm" onClick={() => { onClose(); onReview(pending._id, 'declined'); }}>Decline</Btn>
          </div>
        </Modal>
      );
    }

    return (
      <Modal open={open} onClose={onClose} title="Add Package" size="lg"
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
            <Btn size="sm" onClick={handleAccountantSubmit} disabled={loading || !form.basePackageId || !form.name?.trim() || !form.duration || form.pricePaid === ''}>
              {loading ? <Spinner size="sm" /> : 'Assign Package'}
            </Btn>
          </>
        }>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          Assign a package to <strong>{member.name}</strong>. Select a base package to pre-fill, then enter or adjust all terms before assigning.
        </p>
        <Select
          label="Base Package *"
          value={form.basePackageId}
          onChange={e => handlePackageChange(e.target.value)}
          placeholder="Search packages…"
          initialLimit={5}
        >
          {packages.map(p => <option key={p._id} value={p._id}>{p.name} — {currency} {p.price} ({p.duration})</option>)}
        </Select>
        {form.basePackageId && (
          <div style={{ marginTop: 16 }}>
            <PackageFormFields form={form} set={set} allEditable />
          </div>
        )}
      </Modal>
    );
  }

  // Sales Manager: request only — never assigns directly
  return (
    <>
    <Modal open={open} onClose={onClose} title="Request Package" size="lg"
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" onClick={handleSalesManagerSubmit} disabled={loading || !form.basePackageId || pending}>
            {loading ? <Spinner size="sm" /> : 'Submit for Approval'}
          </Btn>
        </>
      }>
      {pending && (
        <Alert type="warning">This member already has a pending package request awaiting accountant approval.</Alert>
      )}
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
        Request a package for <strong>{member.name}</strong>. The accountant must approve before it is assigned. Turn on <strong>Make Exception</strong> to customize terms.
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: form.basePackageId ? 0 : 16 }}>
        <div style={{ flex: 1 }}>
          <Select
            label="Package *"
            value={form.basePackageId}
            onChange={e => handlePackageChange(e.target.value)}
            disabled={!!pending}
            placeholder="Search packages…"
            initialLimit={5}
          >
            {packages.map(p => <option key={p._id} value={p._id}>{p.name} — {currency} {p.price} ({p.duration})</option>)}
          </Select>
        </div>
        {!pending && (
          <Btn variant="outline" size="sm" onClick={() => setShowCreatePackage(true)} style={{ marginBottom: 1 }}>
            + New Package
          </Btn>
        )}
      </div>

      {form.basePackageId && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <Switch
              label="Make Exception"
              hint={makeException ? 'Fields are editable. Custom terms will be flagged as an exception.' : 'Standard package terms — still requires accountant approval.'}
              checked={makeException}
              onChange={setMakeException}
              disabled={!!pending}
            />
          </div>
          <PackageFormFields form={form} set={set} readOnly={false} makeException={makeException} />
        </div>
      )}
    </Modal>
    <CreateCatalogPackageModal
      open={showCreatePackage}
      onClose={() => setShowCreatePackage(false)}
      form={createForm}
      onChange={setCreateForm}
      errors={createErrors}
      onSubmit={handleCreateCatalogPackage}
      loading={creatingPackage}
    />
    </>
  );
}

function CreateCatalogPackageModal({ open, onClose, form, onChange, errors, onSubmit, loading }) {
  return (
    <Modal open={open} onClose={onClose} title="New Package" size="md"
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn size="sm" onClick={onSubmit} disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Save to Catalog'}
          </Btn>
        </>
      }>
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14 }}>
        Create a new package in the catalog. It will be available for all members after saving.
      </p>
      <CatalogPackageForm form={form} onChange={onChange} errors={errors} />
    </Modal>
  );
}
