import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Table, Badge, Btn, Spinner,
  EmptyState, Avatar, CAIRO_ZONE, Skeleton, Modal, Select,
} from '../../components/ui';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import { getPasswordStrengthError, PASSWORD_REQUIREMENTS_HINT } from '../../lib/validation';
import ChangeRoleField from '../../components/ChangeRoleField';
import StaffRestrictionControls from '../../components/StaffRestrictionControls';
import {
  getSalesProfile, getSalesUsers, updateSalesRepTarget,
  bulkTransferSalesReps, updateSalesRepAbilities, updatePhonePrivacy,
  resetUserPassword,
} from '../../api/endpoints';
import {
  ClipboardList, KeyRound, Lock, MessageCircle, RefreshCw, Smartphone,
} from 'lucide-react';

// ── Abilities config ──────────────────────────────────────────────────────────
const ABILITIES = [
  { key: 'canCommentOnMembers',  label: tr('Comment on Members'),  desc: tr('Can add notes to member profiles'),                     icon: MessageCircle },
  { key: 'canRequestAssignment', label: tr('Request Assignment'),  desc: tr('Can request to be assigned to unassigned members'),     icon: ClipboardList },
  { key: 'canRequestTakeover',   label: tr('Request Takeover'),    desc: tr('Can request to take over members from other reps'),     icon: RefreshCw },
  { key: 'canSendWhatsAppTemplates', label: tr('Send WhatsApp Templates'), desc: tr('Can send pre-made WhatsApp messages from member profiles'), icon: Smartphone },
];

// Lets a translated sentence keep a bold, direction-isolated name inside it.
const NAME_MARK = '\u0000';
const nameParts = (text, name) => {
  const [before, after = ''] = text.split(NAME_MARK);
  return <>{before}<strong><bdi>{name}</bdi></strong>{after}</>;
};

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        border: 'none', padding: 0, flexShrink: 0,
        background: checked ? 'var(--blue)' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.18s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, insetInlineStart: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        transition: 'inset-inline-start 0.18s',
      }} />
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SalesPersonProfile() {
  const { t } = useI18n();
  const { fmtNumber, fmtDate: fmtLocaleDate } = useFormat();
  const fmtDate = (d) => (d ? fmtLocaleDate(d, { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' }, 'en-GB') : '—');
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileTab = searchParams.get('tab');
  const { user: currentUser } = useAuth();
  const isManager = ['Sales Manager', 'Owner'].includes(currentUser?.role);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState(profileTab === 'access' ? 'access' : 'members');
  const [filter,  setFilter]  = useState('all');

  // Target
  const [targetInput,  setTargetInput]  = useState('');
  const [savingTarget, setSavingTarget] = useState(false);

  // Transfer
  const [salesUsers,   setSalesUsers]   = useState([]);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [transferTo,   setTransferTo]   = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Abilities
  const [savingAbility, setSavingAbility] = useState(null);

  // Phone Privacy
  const [savingPhonePrivacy, setSavingPhonePrivacy] = useState(false);

  // Reset Password
  const [showResetPwd,  setShowResetPwd]  = useState(false);
  const [newPwd,        setNewPwd]        = useState('');
  const [confirmPwd,    setConfirmPwd]    = useState('');
  const [resettingPwd,  setResettingPwd]  = useState(false);

  usePageTitle(data?.user?.name ?? t('Sales Profile'));

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSalesProfile(id);
      setData(res.data);
      setTargetInput(String(res.data?.user?.monthlyTarget ?? 0));
    } catch {
      toast.error(t('Failed to load profile.'));
      navigate(-1);
    } finally { setLoading(false); }
  }, [id, navigate, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (profileTab !== 'members' && profileTab !== 'access') return undefined;
    const frame = requestAnimationFrame(() => setTab(profileTab));
    return () => cancelAnimationFrame(frame);
  }, [profileTab]);

  useEffect(() => {
    if (!isManager) return;
    getSalesUsers().then(r => setSalesUsers(r.data.salesUsers ?? [])).catch(() => {});
  }, [isManager]);

  const user       = data?.user;
  const stats      = data?.stats;
  const members    = data?.members ?? [];
  const isSalesRep = user?.role === 'Sales';
  const isReceptionist = user?.role === 'Receptionist';
  const showAccessTab = isManager && (isSalesRep || isReceptionist);

  const filtered = filter === 'all' ? members : members.filter(m => m.status === filter);

  const pct = user?.monthlyTarget > 0
    ? Math.min(100, Math.round(((stats?.monthlyRevenue ?? 0) / user.monthlyTarget) * 100))
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSaveTarget = async () => {
    const target = Number(targetInput);
    if (isNaN(target) || target < 0) { toast.error(t('Target must be a number >= 0')); return; }
    setSavingTarget(true);
    try {
      await updateSalesRepTarget(id, target);
      toast.success(t('Target updated'));
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || t('Failed to update target'));
    } finally { setSavingTarget(false); }
  };

  const handleToggleAbility = async (key, value) => {
    // Optimistic update
    setData(prev => ({
      ...prev,
      user: { ...prev.user, abilities: { ...(prev.user.abilities ?? {}), [key]: value } },
    }));
    setSavingAbility(key);
    try {
      await updateSalesRepAbilities(id, { [key]: value });
      toast.success(t('Permission updated'));
    } catch (e) {
      // Roll back
      setData(prev => ({
        ...prev,
        user: { ...prev.user, abilities: { ...(prev.user.abilities ?? {}), [key]: !value } },
      }));
      toast.error(e.response?.data?.message || t('Failed to update permission'));
    } finally { setSavingAbility(null); }
  };

  const handleTogglePhonePrivacy = async (value) => {
    // Optimistic update
    setData(prev => ({
      ...prev,
      user: { ...prev.user, canViewPhones: value },
    }));
    setSavingPhonePrivacy(true);
    try {
      await updatePhonePrivacy(id, value);
      toast.success(t('Phone privacy updated'));
    } catch (e) {
      // Revert to previous state
      setData(prev => ({
        ...prev,
        user: { ...prev.user, canViewPhones: !value },
      }));
      toast.error(e.response?.data?.message || t('Failed to update phone privacy'));
    } finally { setSavingPhonePrivacy(false); }
  };

  const toggleSelect = memberId => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(memberId) ? next.delete(memberId) : next.add(memberId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === filtered.length
        ? new Set()
        : new Set(filtered.map(m => m._id))
    );
  };

  const handleTransfer = async (transferAll = false) => {
    if (!transferTo) { toast.error(t('Select a destination sales rep')); return; }
    if (!transferAll && !selectedIds.size) { toast.error(t('Select at least one member')); return; }
    setTransferring(true);
    try {
      const payload = { fromSalesRepId: id, toSalesRepId: transferTo };
      if (!transferAll) payload.memberIds = [...selectedIds];
      const res = await bulkTransferSalesReps(payload);
      toast.success(t('Transferred {count} member(s)', { count: res.data.transferredCount }));
      setSelectedIds(new Set()); setTransferTo(''); setShowTransfer(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || t('Transfer failed'));
    } finally { setTransferring(false); }
  };

  const transferOptions = salesUsers.filter(s => s._id !== id);
  const FILTER_LABELS = { all: t('All'), active: t('Active'), frozen: t('Frozen'), expired: t('Expired'), guest: t('Guest') };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <PageHeader walkthrough="sales-profile-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/sales/team')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}>
            {t('← Team')}
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{loading ? t('Loading…') : (user?.name ?? t('Profile'))}</span>
        </div>
      }>
        {!loading && data?.user && (
          <Btn variant="outline" size="sm" onClick={() => { setNewPwd(''); setConfirmPwd(''); setShowResetPwd(true); }}>
            <KeyRound size={14} aria-hidden /> {t('Reset Password')}
          </Btn>
        )}
      </PageHeader>

      <div className="page-wrap" data-walkthrough="staff-body" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? <ProfileSkeleton /> : (
          <>
            {/* ── Profile header card ──────────────────────────────── */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                <Avatar name={user?.name} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{user?.name}</h2>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4 }}>
                      {user?.role ? t(user.role) : null}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--t3)' }}>
                    {user?.email && <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{user.email}</span>}
                    <span>{t('Joined {date}', { date: fmtDate(user?.createdAt) })}</span>
                  </div>
                  <div style={{ maxWidth: 420, marginTop: 10 }}>
                    <ChangeRoleField
                      userId={id}
                      currentRole={user?.role}
                      label={t('Change role')}
                      onChanged={(newRole) => {
                        if (newRole === 'Sales') fetchData();
                        else navigate('/sales/team');
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 12, maxWidth: 480 }}>
                    <StaffRestrictionControls
                      staff={user}
                      currentUser={currentUser}
                      onUpdated={(next) => setData((prev) => (prev ? { ...prev, user: { ...prev.user, ...next } } : prev))}
                    />
                  </div>
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid-stats-5" style={{ background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                {[
                  { l: t('Total'),   v: stats?.total,   c: 'var(--navy)' },
                  { l: t('Active'),  v: stats?.active,  c: 'var(--green)' },
                  { l: t('Frozen'),  v: stats?.frozen,  c: 'var(--sky)' },
                  { l: t('Expired'), v: stats?.expired, c: 'var(--red)' },
                  { l: t('Guests'),  v: stats?.guests,  c: 'var(--t3)' },
                ].map(s => (
                  <div key={s.l} style={{ background: 'var(--card)', padding: '10px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v ?? 0}</div>
                    <div style={{ fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Monthly target */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('Monthly Target')}</span>
                  {pct !== null && (
                    <span dir="ltr" style={{ fontSize: 12, fontWeight: 700, color: pct >= 100 ? 'var(--green)' : 'var(--t2)', unicodeBidi: 'isolate' }}>
                      EGP {fmtNumber(stats?.monthlyRevenue ?? 0)} / {fmtNumber(user.monthlyTarget)} — {pct}%
                    </span>
                  )}
                </div>
                {isManager && isSalesRep ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: pct !== null ? 10 : 0 }}>
                    <input
                      type="number" min="0" value={targetInput}
                      onChange={e => setTargetInput(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'inherit' }}
                      placeholder={t('Monthly target (EGP)')}
                    />
                    <Btn size="sm" onClick={handleSaveTarget} disabled={savingTarget}>
                      {savingTarget ? <Spinner size="sm" /> : t('Save')}
                    </Btn>
                  </div>
                ) : user?.monthlyTarget > 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
                    {t('Target: EGP {amount}', { amount: fmtNumber(user.monthlyTarget) })}
                  </div>
                ) : null}
                {pct !== null && (
                  <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 3,
                      background: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--blue)' : 'var(--amber)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                )}
              </div>
            </Card>

            {/* ── Tabs ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[
                { id: 'members', label: t('Members ({count})', { count: members.length }) },
                ...(showAccessTab ? [{ id: 'access', label: t('Access Control') }] : []),
              ].map(tabItem => (
                <button key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
                  padding: '8px 18px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${tab === tabItem.id ? 'var(--navy)' : 'transparent'}`,
                  marginBottom: -1,
                  color: tab === tabItem.id ? 'var(--t1)' : 'var(--t3)',
                  fontSize: 13, fontWeight: tab === tabItem.id ? 700 : 400,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  transition: 'color 0.12s',
                }}
                  onMouseEnter={e => { if (tab !== tabItem.id) e.currentTarget.style.color = 'var(--t2)'; }}
                  onMouseLeave={e => { if (tab !== tabItem.id) e.currentTarget.style.color = 'var(--t3)'; }}
                >{tabItem.label}</button>
              ))}
            </div>

            {/* ── Tab: Members ─────────────────────────────────────── */}
            {tab === 'members' && (
              <div data-walkthrough="sales-profile-members">
              <Card noPad>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                    {filter !== 'all'
                      ? t('Assigned Members ({count} of {total})', { count: filtered.length, total: members.length })
                      : t('Assigned Members ({count})', { count: filtered.length })}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isManager && members.length > 0 && (
                      <Btn size="sm" variant="ghost" onClick={() => setShowTransfer(true)}>{t('Transfer Members')}</Btn>
                    )}
                    <div style={{ display: 'flex', gap: 5 }}>
                      {['all', 'active', 'frozen', 'expired', 'guest'].map(s => (
                        <button key={s} onClick={() => setFilter(s)} style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: filter === s ? 'var(--navy)' : '#fff',
                          border: `1px solid ${filter === s ? 'var(--navy)' : 'var(--border-md)'}`,
                          color: filter === s ? '#fff' : 'var(--t3)',
                          cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                        }}>{FILTER_LABELS[s]}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {!filtered.length ? (
                  <EmptyState message={t('No members match this filter')} />
                ) : (
                  <Table headers={[...(isManager ? [''] : []), t('ID'), t('Name'), t('Status'), t('Package'), t('Expires')]}>
                    {filtered.map(m => {
                      const sub = m.subscriptions?.at(-1);
                      const pkg = sub?.package;
                      const selected = selectedIds.has(m._id);
                      return (
                        <tr key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
                          style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {isManager && (
                            <td style={{ padding: '10px 14px', width: 36 }} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selected} onChange={() => toggleSelect(m._id)} />
                            </td>
                          )}
                          <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{m.systemId}</span></td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={m.name} size="sm" />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}><Badge status={m.status} /></td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                            {pkg ? `${pkg.name} · ${pkg.duration}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t3)' }}>{fmtDate(sub?.endDate)}</td>
                        </tr>
                      );
                    })}
                  </Table>
                )}
              </Card>
              </div>
            )}

            {/* ── Tab: Access Control ──────────────────────────────── */}
            {tab === 'access' && showAccessTab && (
              <div data-walkthrough="sales-profile-abilities">
              <Card>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
                    {t('Access Permissions')}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>
                    {nameParts(t('Control what {name} is allowed to do in the system. Changes take effect immediately.', { name: NAME_MARK }), user?.name)}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {ABILITIES.map(ability => {
                    const active  = user?.abilities?.[ability.key] !== false;
                    const isSaving = savingAbility === ability.key;
                    const AbilityIcon = ability.icon;
                    return (
                      <div key={ability.key} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        background: 'var(--card)', padding: '14px 16px',
                      }}>
                        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--t2)' }}><AbilityIcon size={20} aria-hidden /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>
                            {t(ability.label)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--t4)' }}>{t(ability.desc)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--green)' : 'var(--red)' }}>
                            {active ? t('Enabled') : t('Disabled')}
                          </span>
                          {isSaving
                            ? <Spinner size="sm" />
                            : <Toggle
                                checked={active}
                                onChange={val => handleToggleAbility(ability.key, val)}
                              />
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Phone Privacy Toggle ──────────────────────────────── */}
                <div style={{ marginTop: 24, marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
                    {t('Privacy Settings')}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>
                    {nameParts(t('Control data visibility for {name}.', { name: NAME_MARK }), user?.name)}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'var(--card)', padding: '14px 16px',
                  }}>
                    <span style={{ display: 'flex', flexShrink: 0, color: 'var(--t2)' }}><Lock size={20} aria-hidden /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>
                        {t('Can View Phone Numbers')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t4)' }}>{t('Can view member phone numbers on profiles')}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: (user?.canViewPhones !== false) ? 'var(--green)' : 'var(--red)' }}>
                        {(user?.canViewPhones !== false) ? t('Enabled') : t('Disabled')}
                      </span>
                      {savingPhonePrivacy
                        ? <Spinner size="sm" />
                        : <Toggle
                            checked={user?.canViewPhones !== false}
                            onChange={val => handleTogglePhonePrivacy(val)}
                          />
                      }
                    </div>
                  </div>
                </div>
              </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Transfer modal ───────────────────────────────────────────── */}
      <Modal
        open={showTransfer}
        onClose={() => !transferring && setShowTransfer(false)}
        title={t('Transfer Members')}
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowTransfer(false)} disabled={transferring}>{t('Cancel')}</Btn>
          <Btn size="sm" variant="ghost" onClick={() => handleTransfer(true)} disabled={transferring || !transferTo}>
            {t('Transfer All ({count})', { count: members.length })}
          </Btn>
          <Btn size="sm" onClick={() => handleTransfer(false)} disabled={transferring || !transferTo || !selectedIds.size}>
            {transferring ? <Spinner size="sm" /> : t('Transfer Selected ({count})', { count: selectedIds.size })}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14 }}>
          {nameParts(t('Transfer members from {name} to another sales representative.', { name: NAME_MARK }), user?.name)}
        </p>
        <Select label={t('Transfer to')} value={transferTo} onChange={e => setTransferTo(e.target.value)}>
          <option value="">{t('— Select sales rep —')}</option>
          {transferOptions.map(s => <option key={s._id} value={s._id}>{s.name} ({t(s.role)})</option>)}
        </Select>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="select-all"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={toggleSelectAll}
          />
          <label htmlFor="select-all" style={{ fontSize: 12, color: 'var(--t3)', cursor: 'pointer' }}>
            {t('Select all visible ({count})', { count: filtered.length })}
          </label>
        </div>
      </Modal>
      {/* ── Reset Password modal ─────────────────────────────────────── */}
      <Modal
        open={showResetPwd}
        onClose={() => !resettingPwd && setShowResetPwd(false)}
        title={t('Reset Password — {name}', { name: data?.user?.name ?? '' })}
        size="sm"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowResetPwd(false)} disabled={resettingPwd}>{t('Cancel')}</Btn>
          <Btn size="sm" disabled={resettingPwd} onClick={async () => {
            const passwordError = getPasswordStrengthError(newPwd, t);
            if (passwordError) { toast.error(passwordError); return; }
            if (newPwd !== confirmPwd) { toast.error(t('Passwords do not match')); return; }
            setResettingPwd(true);
            try {
              const res = await resetUserPassword(id, newPwd);
              toast.success(res.data.message);
              setShowResetPwd(false);
            } catch (e) { toast.error(e.response?.data?.message ?? t('Failed to reset password')); }
            finally { setResettingPwd(false); }
          }}>
            {resettingPwd ? <Spinner size="sm" /> : <><KeyRound size={14} aria-hidden /> {t('Reset Password')}</>}
          </Btn>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          {nameParts(t('Set a new password for {name}. Current sessions are signed out, and they will need this password to sign in again.', { name: NAME_MARK }), data?.user?.name)}
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{t('New Password')}</label>
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t(PASSWORD_REQUIREMENTS_HINT)}
            style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{t('Confirm Password')}</label>
          <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder={t('Repeat new password')}
            style={{ width: '100%', padding: '10px 13px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', background: 'var(--card)', color: 'var(--t1)', boxSizing: 'border-box', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
      </Modal>
    </Layout>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 14 }}>
        <Skeleton h="48px" w="48px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <Skeleton h="14px" w="160px" />
          <Skeleton h="11px" w="220px" />
          <Skeleton h="11px" w="180px" />
        </div>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, height: 220 }} />
    </div>
  );
}
