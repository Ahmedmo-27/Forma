import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, StatCard, Avatar, EmptyState, toLocalDateString, DashboardSkeleton, CAIRO_ZONE } from '../../components/ui';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { getAllMembers, getSalesTeam, getRequests, getTodayCheckIns, getSalesManagerRevenue } from '../../api/endpoints';
import {
  BarChart3,
  Check,
  FileText,
  Package,
  RefreshCw,
  Timer,
  Users,
  X,
} from 'lucide-react';

function getAssignedRepId(member) {
  const rep = member?.assignedSales ?? member?.salesRep;
  if (!rep) return null;
  return String(rep._id ?? rep.id ?? rep);
}

function isCurrentMonth(date) {
  if (!date) return false;
  const dStr = toLocalDateString(date);
  if (!dStr) return false;
  return dStr.slice(0, 7) === toLocalDateString().slice(0, 7);
}

/** Derive per-rep counts/revenue from the members list (authoritative for the dashboard). */
function buildRepStatsFromMembers(members, repId) {
  const stats = { total: 0, active: 0, frozen: 0, expired: 0, guests: 0, monthlyRevenue: 0 };
  const key = String(repId ?? '');
  if (!key) return stats;

  for (const member of members) {
    if (getAssignedRepId(member) !== key) continue;

    stats.total += 1;
    if (member.status === 'active') stats.active += 1;
    else if (member.status === 'frozen') stats.frozen += 1;
    else if (member.status === 'expired') stats.expired += 1;
    else if (member.status === 'guest') stats.guests += 1;

    for (const sub of member.subscriptions || []) {
      const saleDate = sub.startDate || sub.createdAt;
      if (!isCurrentMonth(saleDate)) continue;
      const price = contractNetRevenue(sub);
      if (price > 0) stats.monthlyRevenue += price;
    }
  }

  return stats;
}

function contractRefundAmount(sub) {
  return Math.max(0, Number(sub?.refundAmount) || 0);
}

/** Net collected on this contract: price paid minus the refund stored on the subscription. */
function contractNetRevenue(sub) {
  const paid = Number(sub?.pricePaid) || 0;
  return Math.max(0, paid - contractRefundAmount(sub));
}

function normalizeRepStats(apiStats = {}) {
  return {
    total: Number(apiStats.total ?? 0) || 0,
    active: Number(apiStats.active ?? 0) || 0,
    frozen: Number(apiStats.frozen ?? 0) || 0,
    expired: Number(apiStats.expired ?? 0) || 0,
    guests: Number(apiStats.guests ?? apiStats.guest ?? 0) || 0,
    monthlyRevenue: Number(apiStats.monthlyRevenue ?? 0) || 0,
  };
}

export default function SalesDashboard() {
  const { t } = useI18n();
  const { fmtNumber, fmtDate: fmtLocaleDate, fmtTime: fmtLocaleTime } = useFormat();
  const fmt = (n) => {
    const num = typeof n === 'number' ? n : Number(String(n ?? 0).replace(/,/g, ''));
    return fmtNumber(Number.isFinite(num) ? num : 0);
  };
  const fmtDate = (d) => (d ? fmtLocaleDate(d, { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' }, 'en-GB') : '—');
  const fmtTimeWithSeconds = (d) => (d ? fmtLocaleTime(d, {
    timeZone: CAIRO_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }, 'en-US') : '—');
  usePageTitle(t('Dashboard'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = ['Sales Manager', 'Owner', 'General Manager'].includes(user?.role);

  const [loading, setLoading]   = useState(true);
  const [members, setMembers]   = useState([]);
  const [team, setTeam]         = useState([]);
  const [requests, setRequests] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [revenue, setRevenue]   = useState(null);
  const [showTodaySubs, setShowTodaySubs] = useState(false);
  const [showActivity, setShowActivity]   = useState(false);
  const [repSearch, setRepSearch]         = useState('');

  const load = useCallback(async (attempt = 0) => {
    setLoading(true);
    try {
      const settled = await Promise.allSettled([
        getAllMembers({ all: 'true' }),
        getRequests(),
        getTodayCheckIns(),
        isManager ? getSalesTeam() : Promise.resolve(null),
        isManager ? getSalesManagerRevenue() : Promise.resolve(null),
      ]);

      const [mRes, rRes, cRes, tRes, revRes] = settled;
      const anyFailed = settled.some(r => r.status === 'rejected');

      // If all failed and we haven't retried yet, wait 3s and try once more
      // (handles Atlas cold-start / transient connection drops)
      if (anyFailed && settled.every(r => r.status === 'rejected') && attempt === 0) {
        await new Promise(res => setTimeout(res, 3000));
        return load(1);
      }

      let failed = false;

      if (mRes.status === 'fulfilled') setMembers(mRes.value.data.members ?? []);
      else { setMembers([]); failed = true; }

      if (rRes.status === 'fulfilled') {
        setRequests(rRes.value.data.requests ?? []);
      } else { setRequests([]); failed = true; }

      if (cRes.status === 'fulfilled') setCheckIns(cRes.value.data.checkIns ?? []);
      else { setCheckIns([]); failed = true; }

      if (isManager) {
        if (tRes.status === 'fulfilled') {
          const payload = tRes.value.data;
          setTeam(Array.isArray(payload?.team) ? payload.team : Array.isArray(payload) ? payload : []);
        } else { setTeam([]); failed = true; }

        if (revRes.status === 'fulfilled') setRevenue(revRes.value.data);
        else { setRevenue(null); failed = true; }
      }

      if (failed) toast.error(t('Failed to load some dashboard data'));
    } catch {
      toast.error(t('Failed to load dashboard data'));
    } finally {
      setLoading(false);
    }
  }, [isManager, t]);

  useLocationEffect(() => { load(); }, [load]);

  // Refetch when window regains focus (after navigating back)
  useEffect(() => {
    const handleFocus = () => load();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [load]);

  // Stats
  const _totalMembers = members.length;
  const activeCount  = members.filter(m => m.status === 'active').length;
  const frozenCount  = members.filter(m => m.status === 'frozen').length;
  const expiredCount = members.filter(m => m.status === 'expired').length;
  const guestCount   = members.filter(m => m.status === 'guest').length;
  const pendingReqs  = requests.filter(r => r.status === 'pending').length;

  // Expiring soon (next 7 days)
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const expiringSoon = members.filter(m => {
    const sub = m.subscriptions?.at(-1);
    if (!sub?.endDate || m.status !== 'active') return false;
    const end = new Date(sub.endDate);
    return end >= now && end <= weekFromNow;
  });

  // Today's subscriptions for Sales rep — only today (resets at midnight)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todaySubscriptions = [];
  members.forEach(m => {
    (m.subscriptions || []).forEach(sub => {
      const subDate = new Date(sub.createdAt || sub.startDate);
      if (subDate >= today && subDate < tomorrow) {
        todaySubscriptions.push({ member: m, subscription: sub });
      }
    });
  });
  const todayRevenue = todaySubscriptions.reduce((sum, e) => sum + contractNetRevenue(e.subscription), 0);

  // Filter check-ins: Sales sees only their own, Manager sees all
  const myCheckIns = isManager
    ? checkIns
    : checkIns.filter(c => c.checkedInBy?._id === user?._id);

  // Recent notes from my members (Sales rep) — today only, by current user
  const recentNotes = [];
  if (!isManager) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    members.forEach(m => {
      (m.notes || []).forEach(note => {
        const noteCreatorId = note.createdBy?._id || note.createdBy;
        const isMyNote = String(noteCreatorId) === String(user?._id);
        if (isMyNote && new Date(note.createdAt) >= todayStart) {
          recentNotes.push({
            _id: note._id,
            text: note.text,
            createdAt: note.createdAt,
            createdByName: note.createdBy?.name || user?.name || t('Me'),
            memberName: m.name,
            memberSystemId: m.systemId,
          });
        }
      });
    });
    recentNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const salesReps = team
    .filter((u) => u.role === 'Sales')
    .map((rep) => {
      const fromMembers = buildRepStatsFromMembers(members, rep._id);
      // Prefer member-derived stats when the members list loaded; otherwise API stats.
      const stats = members.length > 0 ? fromMembers : normalizeRepStats(rep.stats);
      const target = Number(rep.monthlyTarget ?? 0) || 0;
      const pct = target > 0
        ? Math.min(100, Math.round((stats.monthlyRevenue / target) * 100))
        : null;
      return { ...rep, stats, monthlyTarget: target, pct };
    })
    .sort((a, b) => {
      if (b.stats.monthlyRevenue !== a.stats.monthlyRevenue) {
        return b.stats.monthlyRevenue - a.stats.monthlyRevenue;
      }
      if (b.stats.total !== a.stats.total) {
        return b.stats.total - a.stats.total;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

  const filteredSalesReps = repSearch.trim()
    ? salesReps.filter(r => r.name?.toLowerCase().includes(repSearch.trim().toLowerCase()))
    : salesReps;

  const contractsTodayLabel = todaySubscriptions.length === 1
    ? t('1 contract today')
    : t('{count} contracts today', { count: todaySubscriptions.length });

  const currentMonthRevenue = Number(
    revenue?.monthlyBreakdown?.[0]?.revenue ?? revenue?.currentMonthRevenue ?? 0
  ) || 0;

  return (
    <Layout>
      <PageHeader walkthrough="sales-dash-header" title={t('Dashboard')}>
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {fmtLocaleDate(new Date(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }, 'en-GB')}
        </span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="sales-dash-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? (
          <DashboardSkeleton stats={6} listRows={5} />
        ) : (
          <>
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12, marginBottom: 20 }}>
              {isManager && revenue && (
                <StatCard label={t("Today's Revenue")} value={`${fmt(revenue.todayRevenue)} EGP`} color="brand"
                  sub={contractsTodayLabel}
                  onClick={() => setShowTodaySubs(true)} />
              )}
              {!isManager && (
                <StatCard label={t("Today's Revenue")} value={`${fmt(todayRevenue)} EGP`} color="brand"
                  sub={contractsTodayLabel}
                  onClick={() => setShowTodaySubs(true)} />
              )}
              <StatCard label={t('Active Members')}  value={activeCount}   color="success" onClick={() => navigate('/sales/members')} />
              <StatCard label={t('Frozen')}          value={frozenCount}   color="info" />
              <StatCard label={t('Expired')}         value={expiredCount}  color="danger" />
              <StatCard label={t('Guests')}          value={guestCount}    color="default" />
              {isManager && (
                <StatCard label={t('Pending Requests')} value={pendingReqs} color="warning"
                  sub={pendingReqs > 0 ? t('Needs review') : t('All clear')} onClick={() => navigate('/sales/requests')} />
              )}
            </div>

            <div className={`grid-split-2${isManager ? ' cols-2' : ''}`}>

              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Manager: Quick Management Shortcuts */}
                {isManager && (
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t('Quick Management')}</span>
                      <span style={{ fontSize: 11, color: 'var(--t4)' }}>{t('Shortcuts')}</span>
                    </div>
                    <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      {[
                        { label: t('Targets'), sub: t('Revenue tracking'), to: '/sales/targets', icon: BarChart3, access: 'targets' },
                        { label: t('Packages'), sub: t('Manage plans'), to: '/sales/packages', icon: Package, access: 'packages' },
                        { label: t('Task Assignment'), sub: t('Distribute members'), to: '/tasks', icon: RefreshCw, access: 'members' },
                        { label: t('Staff Accounts'), sub: t('Manage team access'), to: '/sales/staff', icon: Users, access: 'staff' },
                      ].filter((c) => hasAccess(user, c.access)).map(c => {
                        const ShortcutIcon = c.icon;
                        return (
                        <button key={c.to} onClick={() => navigate(c.to)}
                          style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '12px 14px',
                            textAlign: 'start',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--navy)';
                            e.currentTarget.style.background = 'var(--card)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(68, 41, 140, 0.08)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'var(--bg)';
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: 'var(--card)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, color: 'var(--icon, var(--navy))',
                          }}>
                            <ShortcutIcon size={18} aria-hidden />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{c.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--t4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.sub}</div>
                          </div>
                        </button>
                      );})}
                    </div>
                  </Card>
                )}

                {/* Manager: Expiring soon / Sales: Recent Notes */}
                {isManager ? (
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                        {t('Expiring This Week ({count})', { count: expiringSoon.length })}
                      </span>
                      {expiringSoon.length > 0 && (
                        <span style={{ fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          {t('Needs Renewal')}
                        </span>
                      )}
                    </div>
                    {expiringSoon.length === 0 ? (
                      <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'var(--green-bg)', color: 'var(--green)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          marginBottom: 8, border: '1px solid var(--green-bd)'
                        }}>
                          <Check size={18} strokeWidth={2.5} aria-hidden />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                          {t('All memberships in good standing')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                          {t('No memberships expiring within the next 7 days')}
                        </div>
                      </div>
                    ) : (
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {expiringSoon.slice(0, 10).map(m => {
                          const sub = m.subscriptions?.at(-1);
                          return (
                            <div key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <Avatar name={m.name} size="sm" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--t4)' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{m.systemId}</span></div>
                              </div>
                              <div style={{ textAlign: 'end', flexShrink: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>{t('Expires {date}', { date: fmtDate(sub?.endDate) })}</div>
                                <div style={{ fontSize: 11, color: 'var(--t4)' }}>{sub?.package?.name}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                ) : (
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                        {t('Recent Notes ({count})', { count: recentNotes.length })}
                      </span>
                    </div>
                    {recentNotes.length === 0 ? (
                      <EmptyState icon={FileText} message={t('No recent notes')} sub={t('Notes added to your members will appear here')} />
                    ) : (
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {recentNotes.slice(0, 8).map((note, i) => (
                          <div key={note._id ?? i} onClick={() => navigate(`/members/${note.memberSystemId}?tab=callcenter`)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <Avatar name={note.memberName} size="sm" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{note.memberName}</div>
                              <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
                                {note.text.length > 80 ? note.text.slice(0, 80) + '…' : note.text}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 3 }}>
                                {t('by {name} · {date}', { name: note.createdByName, date: fmtLocaleDate(note.createdAt, { day: '2-digit', month: 'short' }, 'en-GB') })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Today's Activity Card */}
                <Card noPad>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t("Today's Activity")}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        background: myCheckIns.length > 0 ? 'var(--sky-bg)' : 'var(--bg)',
                        color: myCheckIns.length > 0 ? 'var(--sky)' : 'var(--t3)',
                        border: `1px solid ${myCheckIns.length > 0 ? 'var(--sky-bd)' : 'var(--border)'}`,
                        padding: '2px 8px', borderRadius: 10
                      }}>
                        {myCheckIns.length === 1 ? t('1 check-in') : t('{count} check-ins', { count: myCheckIns.length })}
                      </span>
                    </div>
                    {myCheckIns.length > 0 && (
                      <button
                        onClick={() => setShowActivity(true)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 600, color: 'var(--navy)',
                          padding: 0
                        }}
                      >
                        {t('View all →')}
                      </button>
                    )}
                  </div>
                  {myCheckIns.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: 'var(--t3)' }}>
                        <Timer size={20} aria-hidden />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{t('No check-ins recorded yet today')}</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{t('Activity will appear in real time as members arrive')}</div>
                    </div>
                  ) : (
                    <div>
                      {myCheckIns.slice(0, 4).map((entry, i) => (
                        <div key={entry._id ?? i}
                          onClick={() => navigate(`/members/${entry.member?.systemId}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: i < Math.min(3, myCheckIns.length - 1) ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Avatar name={entry.member?.name || t('Member')} size="sm" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {entry.member?.name}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--t4)' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{entry.member?.systemId}</span></div>
                          </div>
                          <div style={{ textAlign: 'end', flexShrink: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>{fmtTimeWithSeconds(entry.time)}</div>
                            {entry.checkedInBy?.name && (
                              <div style={{ fontSize: 10, color: 'var(--t4)' }}>{t('by {name}', { name: entry.checkedInBy.name })}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {myCheckIns.length > 4 && (
                        <div
                          onClick={() => setShowActivity(true)}
                          style={{
                            padding: '8px 18px', textAlign: 'center',
                            fontSize: 11, fontWeight: 600, color: 'var(--navy)',
                            background: 'var(--bg)', cursor: 'pointer',
                            borderTop: '1px solid var(--border)'
                          }}
                        >
                          {t('+{count} more check-ins · View all', { count: myCheckIns.length - 4 })}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </div>

              {/* Right column (Manager only) */}
              {isManager && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Revenue Overview */}
                  {revenue && (
                    <Card noPad>
                      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t('Revenue Overview')}</span>
                        </div>
                        <span style={{ fontSize: 11, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          {t('Active Period')}
                        </span>
                      </div>
                      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.05) 0%, rgba(22, 163, 74, 0.01) 100%)',
                          borderRadius: 8,
                          border: '1px solid var(--green-bd)',
                          padding: '12px 14px'
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--green)', marginBottom: 4 }}>
                            {t('This Month')}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>
                            {fmt(currentMonthRevenue)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>EGP</span>
                          </div>
                        </div>
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(68, 41, 140, 0.05) 0%, rgba(68, 41, 140, 0.01) 100%)',
                          borderRadius: 8,
                          border: '1px solid rgba(68, 41, 140, 0.2)',
                          padding: '12px 14px'
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy)', marginBottom: 4 }}>
                            {t('This Year')}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>
                            {fmt(revenue.currentYearRevenue)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>EGP</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Team performance */}
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t('Team Performance')}</span>
                        <span style={{ fontSize: 11, background: 'var(--bg)', color: 'var(--t3)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                          {t('{count} reps', { count: salesReps.length })}
                        </span>
                      </div>
                      {hasAccess(user, 'sales_team') && (
                        <span onClick={() => navigate('/sales/team')} style={{ fontSize: 11, color: 'var(--navy)', cursor: 'pointer', fontWeight: 600 }}>
                          {t('View team →')}
                        </span>
                      )}
                    </div>

                    {/* Quick search when team has > 5 reps */}
                    {salesReps.length > 5 && (
                      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <input
                          type="text"
                          placeholder={t('Filter sales reps...')}
                          value={repSearch}
                          onChange={e => setRepSearch(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            fontSize: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--card)',
                            color: 'var(--t1)',
                            outline: 'none',
                          }}
                        />
                      </div>
                    )}

                    {filteredSalesReps.length === 0 ? (
                      <EmptyState message={salesReps.length === 0 ? t('No sales reps found') : t('No matching sales reps')} />
                    ) : (
                      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                        {filteredSalesReps.map((rep, idx) => (
                          <div key={rep._id} onClick={() => navigate(`/sales/team/${rep._id}`)}
                            style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rep.pct !== null ? 8 : 0 }}>
                              {/* Leaderboard rank */}
                              <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                fontSize: 10, fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                background: idx === 0 && rep.stats.monthlyRevenue > 0 ? '#FEF08A' : idx === 1 && rep.stats.monthlyRevenue > 0 ? '#E2E8F0' : idx === 2 && rep.stats.monthlyRevenue > 0 ? '#FED7AA' : 'transparent',
                                color: idx === 0 && rep.stats.monthlyRevenue > 0 ? '#854D0E' : idx === 1 && rep.stats.monthlyRevenue > 0 ? '#475569' : idx === 2 && rep.stats.monthlyRevenue > 0 ? '#9A3412' : 'var(--t4)'
                              }}>
                                {idx + 1}
                              </div>

                              <Avatar name={rep.name} size="sm" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {rep.name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                                  {t('{count} members', { count: fmt(rep.stats.total) })} · <span style={{ fontWeight: 600, color: rep.stats.monthlyRevenue > 0 ? 'var(--t2)' : 'var(--t4)' }}>{t('{amount} EGP this month', { amount: fmt(rep.stats.monthlyRevenue) })}</span>
                                </div>
                              </div>
                              {rep.pct !== null && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: rep.pct >= 100 ? 'var(--green)' : rep.pct >= 60 ? 'var(--navy)' : 'var(--amber)' }}>
                                  {rep.pct}%
                                </span>
                              )}
                            </div>
                            {rep.pct !== null && (
                              <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, border: '1px solid var(--border)', overflow: 'hidden', marginInlineStart: 32 }}>
                                <div style={{ height: '100%', width: `${rep.pct}%`, background: rep.pct >= 100 ? 'var(--green)' : rep.pct >= 60 ? 'var(--navy)' : 'var(--amber)', borderRadius: 2 }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Today's Activity Popup */}
      {showActivity && (
        <div
          onClick={() => setShowActivity(false)}
          className="modal-backdrop-in"
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} className="modal-panel-in" style={{
            background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
            width: '100%', maxWidth: 500, maxHeight: '80svh', overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{t("Today's Check-Ins ({count})", { count: myCheckIns.length })}</h2>
              <button type="button" onClick={() => setShowActivity(false)} aria-label={t('Close')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, width: 26, height: 26, cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} aria-hidden /></button>
            </div>
            {myCheckIns.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--t3)' }}>{t('No check-ins yet today')}</p>
              </div>
            ) : (
              <div>
                {myCheckIns.map((entry, i) => (
                  <div key={entry._id ?? i}
                    onClick={() => { setShowActivity(false); navigate(`/members/${entry.member.systemId}`); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Avatar name={entry.member.name} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{entry.member.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{entry.member.systemId}</span></div>
                    </div>
                    <div style={{ textAlign: 'end', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                        {fmtTimeWithSeconds(entry.time)}
                      </div>
                      {entry.checkedInBy?.name && (
                        <div style={{ fontSize: 10, color: 'var(--t4)' }}>{t('by {name}', { name: entry.checkedInBy.name })}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Today's Contracts Popup */}
      {showTodaySubs && (
        <div
          onClick={() => setShowTodaySubs(false)}
          className="modal-backdrop-in"
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} className="modal-panel-in" style={{
            background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
            width: '100%', maxWidth: 600, maxHeight: '80svh', overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{t("Today's Contracts ({count})", { count: todaySubscriptions.length })}</h2>
              <button type="button" onClick={() => setShowTodaySubs(false)} aria-label={t('Close')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, width: 26, height: 26, cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} aria-hidden /></button>
            </div>
            {todaySubscriptions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--t3)' }}>{t('No contracts entered today')}</p>
              </div>
            ) : (
              <div>
                <div style={{ padding: '10px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>{t('Total Revenue')}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{fmt(todayRevenue)} EGP</span>
                </div>
                {todaySubscriptions.map((entry, i) => {
                  const paid = Number(entry.subscription.pricePaid) || 0;
                  const refunded = contractRefundAmount(entry.subscription);
                  const net = contractNetRevenue(entry.subscription);
                  return (
                  <div key={i}
                    onClick={() => { setShowTodaySubs(false); navigate(`/members/${entry.member.systemId}`); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Avatar name={entry.member.name} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{entry.member.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{entry.member.systemId}</span> · {entry.subscription.package?.name ?? t('Package')}
                        {isManager && entry.member.assignedSales?.name && (
                          <span> · {t('Sales: {name}', { name: entry.member.assignedSales.name })}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'end', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                        {fmt(net)} EGP
                      </div>
                      {refunded > 0 && (
                        <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 10, color: 'var(--t4)', textDecoration: 'line-through' }}>
                            {fmt(paid)} EGP
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            fontSize: 10, fontWeight: 700, lineHeight: 1.3,
                            background: 'var(--red-bg)', color: 'var(--red)',
                            border: '1px solid var(--red-bd)',
                            padding: '2px 6px', borderRadius: 4,
                          }}>
                            {t('Refunded {amount} EGP', { amount: fmt(refunded) })}
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: refunded > 0 ? 3 : 0 }}>
                        {entry.subscription.isRenewal ? t('Renewal') : t('New')}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
