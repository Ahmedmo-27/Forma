import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useLocationScope, ALL_LOCATIONS } from '../../context/LocationContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Tabs, Badge, Btn, Spinner, Skeleton, Modal, Input, fmtDateTime } from '../../components/ui';
import { getMemberProfile, checkInMember, blockMember, unblockMember, refundMember } from '../../api/endpoints';
import ProfilePhotoUpload from '../../components/ProfilePhotoUpload';
import MemberQrButton from '../../components/MemberQrButton';
import { formatSystemId } from '../../lib/systemId';
import PersonalTab    from './tabs/PersonalTab';
import PackagesTab    from './tabs/PackagesTab';
import CallCenterTab  from './tabs/CallCenterTab';
import FreezeTab      from './tabs/FreezeTab';
import InvitationsTab from './tabs/InvitationsTab';
import CheckInsTab    from './tabs/CheckInsTab';
import OthersTab      from './tabs/OthersTab';
import FilesTab       from './tabs/FilesTab';
import AlertsTab      from './tabs/AlertsTab';
import DashboardTab   from './tabs/DashboardTab';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Briefcase,
  Clock,
  Dumbbell,
  Hash,
  IdCard,
  Phone,
  User,
} from 'lucide-react';

const TABS = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'personal',    label: 'Personal Info' },
  { id: 'packages',    label: 'Packages' },
  { id: 'files',       label: 'Files' },
  { id: 'alerts',      label: 'Alerts' },
  { id: 'callcenter',  label: 'Call Center' },
  { id: 'freeze',      label: 'Freeze' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'checkins',    label: 'Check-In History' },
  { id: 'others',      label: 'Others' },
];

export default function MemberProfile() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currency = 'EGP' } = useTenant() || {};
  const { multiEnabled, selectedLocationId, locations } = useLocationScope();
  const navigate = useNavigate();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setTab]     = useState(() => searchParams.get('tab') || 'dashboard');
  const [checkingIn, setChecking] = useState(false);
  const [alertPopup, setAlertPopup] = useState(null); // array of alert texts or null
  const alertShownRef = useRef(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockReason, setBlockReason]       = useState('');
  const [blocking, setBlocking]             = useState(false);

  // Refund
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount]       = useState('');
  const [refundReason, setRefundReason]       = useState('');
  const [refunding, setRefunding]             = useState(false);

  usePageTitle(data?.member?.name ?? 'Profile');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) setTab(tab);
  }, [searchParams]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMemberProfile(id);
      if (!res.data?.member) {
        toast.error('Member not found.');
        navigate(-1);
        return;
      }
      setData(res.data);

      // Show active alerts as a big centered popup (5 sec auto-dismiss) — only on first load
      const activeAlerts = (res.data.member?.alert || []).filter(a => a?.active);
      if (activeAlerts.length > 0 && !alertShownRef.current) {
        alertShownRef.current = true;
        setAlertPopup(activeAlerts.map(a => a.text));
        setTimeout(() => setAlertPopup(null), 5000);
      }
    } catch (e) {
      const msg = e.response?.data?.message;
      toast.error(msg === 'Access denied' ? 'You do not have permission to view this profile.' : (msg ?? 'Member not found.'));
      navigate(-1);
    }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleCheckIn = async () => {
    if (!canCheckIn) {
      const reason = member?.isBlocked
        ? 'Cannot check in — member is blocked'
        : isGuest
        ? 'Cannot check in — this member is a guest and does not have a package'
        : !currentPkg
        ? 'Cannot check in — this member does not have a package'
        : isExpired
        ? 'Cannot check in — this member has an expired package'
        : 'Cannot check in';
      toast.error(reason);
      return;
    }
    setChecking(true);
    try {
      const payload = {};
      if (multiEnabled) {
        const desk =
          (selectedLocationId && selectedLocationId !== ALL_LOCATIONS && selectedLocationId)
          || member?.locationId
          || (locations[0] && locations[0]._id)
          || '';
        if (desk) payload.locationId = String(desk);
      }
      const res = await checkInMember(id, payload);
      toast.success(res.data.message);
      fetchProfile();
    }
    catch (e) { toast.error(e.response?.data?.message ?? 'Check-in failed.'); }
    finally { setChecking(false); }
  };

  const handleBlock = async () => {
    setBlocking(true);
    try {
      await blockMember(member.systemId, blockReason.trim());
      toast.success('Member blocked');
      setShowBlockModal(false);
      setBlockReason('');
      fetchProfile();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Failed to block member.'); }
    finally { setBlocking(false); }
  };

  const handleUnblock = async () => {
    setBlocking(true);
    try {
      await unblockMember(member.systemId);
      toast.success('Member unblocked');
      fetchProfile();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Failed to unblock member.'); }
    finally { setBlocking(false); }
  };

  const handleRefund = async () => {
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid refund amount'); return; }
    setRefunding(true);
    try {
      const res = await refundMember(member._id, amount, refundReason.trim() || undefined);
      toast.success(res.data.message ?? 'Refund issued successfully');
      setShowRefundModal(false);
      setRefundAmount('');
      setRefundReason('');
      fetchProfile();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Refund failed.'); }
    finally { setRefunding(false); }
  };

  const member = data?.member;
  const stats  = data?.stats;
  const currentSub = member?.subscriptions?.filter(s => !s.refunded && !s.cancelled && s.subscriptionStatus !== 'cancelled')?.at(-1);
  const currentPkg = currentSub?.packageSnapshot ?? currentSub?.package;
  const isGuest = member?.status === 'guest' || member?.isMember === false;
  const hasMemberId = member?.memberId != null && String(member.memberId).trim() !== '';
  const canSendQr = Boolean(member && !isGuest && hasMemberId);
  const isExpired = member?.status === 'expired' || (currentSub?.endDate && new Date(currentSub.endDate) < new Date());
  const canCheckIn = Boolean(member && !member.isBlocked && !isGuest && currentPkg && (!isExpired || member.status === 'frozen'));

  return (
    <Layout>
      <PageHeader walkthrough="member-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Back
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{loading ? 'Loading…' : (member?.name ?? 'Profile')}</span>
        </div>
      }>
        <div className="member-profile-actions" data-walkthrough="member-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {canSendQr && <MemberQrButton member={member} onSent={fetchProfile} />}
          {member && ['Receptionist', 'Owner', 'Sales Manager'].includes(user?.role) && (
            <Btn variant={canCheckIn ? 'success' : 'outline'} size="sm"
              onClick={handleCheckIn} disabled={checkingIn || !canCheckIn}
              title={
                !canCheckIn
                  ? member.isBlocked
                    ? 'Member is blocked'
                    : isGuest
                    ? 'This member is a guest and does not have a package'
                    : !currentPkg
                    ? 'This member does not have a package'
                    : isExpired
                    ? 'This member has an expired package'
                    : 'Cannot check in'
                  : 'Check In'
              }>
              {checkingIn ? <Spinner size="sm" /> : 'Check In'}
            </Btn>
          )}
          {member && user?.role === 'Sales Manager' && (
            member.isBlocked
              ? <Btn variant="outline" size="sm" onClick={handleUnblock} disabled={blocking}>
                  {blocking ? <Spinner size="sm" /> : 'Unblock'}
                </Btn>
              : <Btn variant="danger" size="sm" onClick={() => setShowBlockModal(true)}>
                  Block
                </Btn>
          )}
        </div>

      </PageHeader>

      <div className="page-wrap" data-walkthrough="member-body" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? <ProfileSkeleton /> : !member ? null : (
          <>
            {/* Blocked banner */}
            {member.isBlocked && (
              <div style={{
                background: 'var(--red-bg)', border: '1px solid var(--red-bd)',
                borderLeft: '4px solid var(--red)', borderRadius: 8,
                padding: '12px 16px', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <Ban size={22} color="var(--red)" aria-hidden />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>This member is blocked</p>
                  {member.blockedReason && (
                    <p style={{ fontSize: 12, color: 'var(--red)', opacity: 0.8 }}>Reason: {member.blockedReason}</p>
                  )}
                </div>
              </div>
            )}
            <ProfileHeader member={member} stats={stats} user={user} onPhotoUploaded={fetchProfile} />
            <div data-walkthrough="member-tabs">
              <Tabs tabs={TABS} active={activeTab} onChange={setTab} />
            </div>
            <div className="fade-up" data-walkthrough="member-panel">
              {activeTab === 'dashboard'   && <DashboardTab   member={member} user={user} data={data} onTabChange={setTab} />}
              {activeTab === 'personal'    && <PersonalTab    member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'packages'    && <PackagesTab    member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'files'       && <FilesTab       member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'alerts'      && <AlertsTab      member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'callcenter'  && <CallCenterTab  member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'freeze'      && <FreezeTab      member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'invitations' && <InvitationsTab member={member} user={user} onRefresh={fetchProfile} />}
              {activeTab === 'checkins'    && <CheckInsTab    checkIns={data?.checkIns ?? []} ptSessions={data?.ptSessions ?? []} stats={data?.stats} member={member} />}
              {activeTab === 'others'      && <OthersTab      profileViews={data?.profileViews ?? []} member={member} user={user} />}
            </div>
          </>
        )}
      </div>

      {/* ── Refund Modal ────────────────────────────────────────── */}
      <Modal open={showRefundModal} onClose={() => !refunding && setShowRefundModal(false)} title="Issue Refund" size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowRefundModal(false)} disabled={refunding}>Cancel</Btn>
          <Btn variant="danger" size="sm" onClick={handleRefund} disabled={refunding}>
            {refunding ? <Spinner size="sm" /> : 'Confirm Refund'}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          Refund will be deducted from the member's last subscription revenue. Member status will be set back to <strong>guest</strong>.
        </p>
        {member && (() => {
          const lastSub = member.subscriptions?.at(-1);
          const pricePaid = lastSub?.pricePaid ?? 0;
          const alreadyRefunded = lastSub?.refundAmount ?? 0;
          const maxRefund = pricePaid - alreadyRefunded;
          return (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Price Paid</span>
                <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{pricePaid} {currency}</span>
              </div>
              {alreadyRefunded > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Already Refunded</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>{alreadyRefunded} {currency}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                <span style={{ color: 'var(--t4)', fontWeight: 600 }}>Max Refundable</span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{maxRefund} {currency}</span>
              </div>
            </div>
          );
        })()}
        <Input
          label={`Refund Amount (${currency}) *`}
          type="number"
          min="1"
          value={refundAmount}
          onChange={e => setRefundAmount(e.target.value)}
          placeholder="Enter amount to refund"
        />
        <Input
          label="Reason (optional)"
          value={refundReason}
          onChange={e => setRefundReason(e.target.value)}
          placeholder="e.g. Member cancelled, duplicate payment"
        />
      </Modal>

      {/* ── Block Modal ─────────────────────────────────────────── */}
      <Modal open={showBlockModal} onClose={() => setShowBlockModal(false)} title="Block Member" size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowBlockModal(false)} disabled={blocking}>Cancel</Btn>
          <Btn variant="danger" size="sm" onClick={handleBlock} disabled={blocking}>
            {blocking ? <Spinner size="sm" /> : 'Block Member'}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
          Blocking this member will prevent check-ins and flag their profile. Are you sure?
        </p>
        <Input
          label="Reason (optional)"
          value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          placeholder="e.g. Outstanding balance, inappropriate behavior"
        />
      </Modal>

      {/* ── Alert Popup (big centered, auto-dismiss 5s) ──────────── */}
      {alertPopup && (
        <div
          onClick={() => setAlertPopup(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,1.0)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'pointer',
          }}
        >
          <div style={{
            background: '#fffbeb', border: '2px solid #f59e0b',
            borderRadius: 16, padding: '32px 40px', maxWidth: 500, width: '100%',
            textAlign: 'center', boxShadow: '0 20px 60px rgba(245,158,11,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: '#92400e' }}>
              <AlertTriangle size={48} strokeWidth={1.5} aria-hidden />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#92400e', marginBottom: 16 }}>
              Member Alert
            </h2>
            {alertPopup.map((text, i) => (
              <p key={i} style={{ fontSize: 18, fontWeight: 600, color: '#78350f', lineHeight: 1.6, marginBottom: 8 }}>
                {text}
              </p>
            ))}
            <p style={{ fontSize: 12, color: '#b45309', marginTop: 16 }}>
              Click anywhere to dismiss · Auto-closes in 5 seconds
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}

function ProfileHeader({ member, stats, user, onPhotoUploaded }) {
  const sub = member.subscriptions?.at(-1);
  const pkg = sub?.packageSnapshot ?? sub?.package;
  const totalCheckIns = stats?.totalCheckIns ?? 0;

  const lastCheckIn = (member.userlog ?? [])
    .filter(l => l.type === 'check-in')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  const copy = (val) => { navigator.clipboard?.writeText(String(val)); toast.success('Copied!'); };

  // ── reusable chip ──────────────────────────────────────────
  const Chip = ({ icon: Icon, label, copyVal, accent }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 13, color: accent ? accent : 'var(--t2)',
      background: 'var(--bg)', border: `1px solid ${accent ? accent + '33' : 'var(--border)'}`,
      borderRadius: 7, padding: '4px 10px', whiteSpace: 'nowrap',
    }}>
      {Icon && <Icon size={13} style={{ opacity: 0.8, flexShrink: 0 }} aria-hidden />}
      {label}
      {copyVal && (
        <button
          onClick={() => copy(copyVal)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: '0 0 0 3px', display: 'inline-flex', alignItems: 'center', transition: 'color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--navy)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
          title="Copy"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      )}
    </span>
  );

  // ── Phone chip with show/hide (role-based) ────────────────
  const PhoneChip = ({ phone }) => {
    const [visible, setVisible] = useState(false);
    if (!phone || phone === 'hidden') return null;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, color: 'var(--t2)',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 7, padding: '4px 10px', whiteSpace: 'nowrap',
      }}>
        <Phone size={13} style={{ opacity: 0.8, flexShrink: 0 }} aria-hidden />
        {visible ? (
          <>
            <span style={{ fontFamily: 'monospace' }}>{phone}</span>
            <button onClick={() => copy(phone)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: '0 0 0 2px', display: 'inline-flex', alignItems: 'center', transition: 'color 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--navy)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
              title="Copy"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button onClick={() => setVisible(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 11, fontFamily: 'inherit', padding: 0, transition: 'color 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--t3)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
            >Hide</button>
          </>
        ) : (
          <button onClick={() => setVisible(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy)', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', padding: 0 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >Show Number</button>
        )}
      </span>
    );
  };

  return (
    <div className="profile-header-card" style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 'clamp(14px, 3vw, 18px) clamp(14px, 3vw, 22px)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    }}>

      {/* ── Photo ─────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, alignSelf: 'center' }}>
        <ProfilePhotoUpload member={member} user={user} onUploaded={onPhotoUploaded} />
      </div>

      {/* ── Info block ────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Row 1: Name + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)', margin: 0, letterSpacing: '-0.3px' }}>
            {member.name}
          </h2>
          <Badge status={member.isBlocked ? 'blocked' : member.status} />
        </div>

        {/* Row 2: IDs + gender + phone + last check-in */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {member.memberId  && <Chip icon={IdCard} label={`Member ID: ${member.memberId}`}    copyVal={String(member.memberId)} />}
          {member.systemId  && <Chip icon={Hash} label={`System ID: ${formatSystemId(member.systemId)}`}  copyVal={formatSystemId(member.systemId)} />}
          {member.gender    && <Chip icon={User} label={member.gender.charAt(0).toUpperCase() + member.gender.slice(1)} />}
          {member.phones && <PhoneChip phone={member.phones} />}
          {lastCheckIn      && (
            <Chip icon={Clock} label={`Last Check-In: ${fmtDateTime(lastCheckIn.createdAt)}`} />
          )}
        </div>

        {/* Row 3: Coach + Sales + Total Visits — separated by a divider dot */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {member.current_couch && <Chip icon={Dumbbell} label={`Coach: ${member.current_couch.name}`} accent="var(--sky)" />}
          {member.assignedSales && <Chip icon={Briefcase} label={`Sales: ${member.assignedSales.name}`} accent="var(--amber)" />}
          <Chip icon={BarChart3} label={`${totalCheckIns} Total Visits`} />
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', display: 'flex', gap: 14 }}>
        <Skeleton h="48px" w="48px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <Skeleton h="14px" w="160px" /><Skeleton h="11px" w="240px" /><Skeleton h="11px" w="180px" />
        </div>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, height: 200 }} />
    </div>
  );
}
