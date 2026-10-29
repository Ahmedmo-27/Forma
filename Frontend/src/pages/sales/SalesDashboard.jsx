import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, CardHeader, StatCard, Spinner, Avatar, Badge, EmptyState, fmtDate } from '../../components/ui';
import { getAllMembers, getSalesTeam, getRequests, getTodayCheckIns, getSalesManagerRevenue } from '../../api/endpoints';

const fmt = (n) => {
  const num = typeof n === 'number' ? n : Number(String(n ?? 0).replace(/,/g, ''));
  return Number.isFinite(num) ? num.toLocaleString() : '0';
};

function getAssignedRepId(member) {
  const rep = member?.assignedSales ?? member?.salesRep;
  if (!rep) return null;
  return String(rep._id ?? rep.id ?? rep);
}

function isCurrentMonth(date) {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
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
      const price = Number(sub.pricePaid ?? sub.packageSnapshot?.price ?? sub.package?.price ?? 0);
      if (Number.isFinite(price) && price > 0) stats.monthlyRevenue += price;
    }
  }

  return stats;
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
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = ['Sales Manager', 'Owner'].includes(user?.role);

  const [loading, setLoading]   = useState(true);
  const [members, setMembers]   = useState([]);
  const [team, setTeam]         = useState([]);
  const [requests, setRequests] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [revenue, setRevenue]   = useState(null);
  const [showTodaySubs, setShowTodaySubs] = useState(false);
  const [showActivity, setShowActivity]   = useState(false);

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

      if (failed) toast.error('Failed to load some dashboard data');
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => { load(); }, [load]);

  // Refetch when window regains focus (after navigating back)
  useEffect(() => {
    const handleFocus = () => load();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [load]);

  // Stats
  const totalMembers = members.length;
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

  // Unassigned
  const unassigned = members.filter(m => !m.assignedSales);

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
  const todayRevenue = todaySubscriptions.reduce((sum, e) => sum + (e.subscription.pricePaid || 0), 0);

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
            createdByName: note.createdBy?.name || user?.name || 'Me',
            memberName: m.name,
            memberSystemId: m.systemId,
          });
        }
      });
    });
    recentNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const salesReps = team
    .filter((t) => t.role === 'Sales')
    .map((rep) => {
      const fromMembers = buildRepStatsFromMembers(members, rep._id);
      // Prefer member-derived stats when the members list loaded; otherwise API stats.
      const stats = members.length > 0 ? fromMembers : normalizeRepStats(rep.stats);
      const target = Number(rep.monthlyTarget ?? 0) || 0;
      const pct = target > 0
        ? Math.min(100, Math.round((stats.monthlyRevenue / target) * 100))
        : null;
      return { ...rep, stats, monthlyTarget: target, pct };
    });

  const currentMonthRevenue = Number(
    revenue?.monthlyBreakdown?.[0]?.revenue ?? revenue?.currentMonthRevenue ?? 0
  ) || 0;

  return (
    <Layout>
      <PageHeader title="Dashboard">
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size="lg" /></div>
        ) : (
          <>
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              {isManager && revenue && (
                <StatCard label="Today's Revenue" value={`${fmt(revenue.todayRevenue)} EGP`} color="brand"
                  sub={`${todaySubscriptions.length} contract${todaySubscriptions.length !== 1 ? 's' : ''} today`}
                  onClick={() => setShowTodaySubs(true)} />
              )}
              {!isManager && (
                <StatCard label="Today's Revenue" value={`${fmt(todayRevenue)} EGP`} color="brand"
                  sub={`${todaySubscriptions.length} contract${todaySubscriptions.length !== 1 ? 's' : ''} today`}
                  onClick={() => setShowTodaySubs(true)} />
              )}
              <StatCard label="Active Members"  value={activeCount}   color="success" onClick={() => navigate('/sales/members')} />
              <StatCard label="Frozen"          value={frozenCount}   color="info" />
              <StatCard label="Expired"         value={expiredCount}  color="danger" />
              <StatCard label="Guests"          value={guestCount}    color="default" />
              {isManager && (
                <StatCard label="Pending Requests" value={pendingReqs} color="warning"
                  sub={pendingReqs > 0 ? 'Needs review' : 'All clear'} onClick={() => navigate('/sales/requests')} />
              )}
            </div>

            <div className={`grid-split-2${isManager ? ' cols-2' : ''}`}>

              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Manager: Expiring soon / Sales: Recent Notes */}
                {isManager ? (
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                        Expiring This Week ({expiringSoon.length})
                      </span>
                      {expiringSoon.length > 0 && (
                        <span style={{ fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          Needs Renewal
                        </span>
                      )}
                    </div>
                    {expiringSoon.length === 0 ? (
                      <EmptyState icon="✓" message="No members expiring this week" />
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
                                <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{m.systemId}</div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Expires {fmtDate(sub?.endDate)}</div>
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
                        Recent Notes ({recentNotes.length})
                      </span>
                    </div>
                    {recentNotes.length === 0 ? (
                      <EmptyState icon="📝" message="No recent notes" sub="Notes added to your members will appear here" />
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
                                by {note.createdByName} · {new Date(note.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Unassigned members */}
                {isManager && unassigned.length > 0 && (
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                        Unassigned Members ({unassigned.length})
                      </span>
                      <span style={{ fontSize: 11, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                        Needs Assignment
                      </span>
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {unassigned.slice(0, 8).map(m => (
                        <div key={m._id} onClick={() => navigate(`/members/${m.systemId}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Avatar name={m.name} size="sm" />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{m.systemId} · <Badge status={m.status} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Today's Activity box */}
                <StatCard
                  label="Today's Activity"
                  value={`${myCheckIns.length} check-in${myCheckIns.length !== 1 ? 's' : ''}`}
                  color="blue"
                  sub="Click to view details"
                  onClick={() => setShowActivity(true)}
                />
              </div>

              {/* Right column (Manager only) */}
              {isManager && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Team performance */}
                  <Card noPad>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Team Performance</span>
                      <span onClick={() => navigate('/sales/team')} style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>View team →</span>
                    </div>
                    {salesReps.length === 0 ? (
                      <EmptyState message="No sales reps found" />
                    ) : (
                      <div>
                        {salesReps.map(rep => (
                            <div key={rep._id} onClick={() => navigate(`/sales/team/${rep._id}`)}
                              style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rep.pct !== null ? 8 : 0 }}>
                                <Avatar name={rep.name} size="sm" />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{rep.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                                    {fmt(rep.stats.total)} members · {fmt(rep.stats.monthlyRevenue)} EGP this month
                                  </div>
                                </div>
                                {rep.pct !== null && (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: rep.pct >= 100 ? 'var(--green)' : rep.pct >= 60 ? 'var(--blue)' : 'var(--amber)' }}>
                                    {rep.pct}%
                                  </span>
                                )}
                              </div>
                              {rep.pct !== null && (
                                <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, border: '1px solid var(--border)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${rep.pct}%`, background: rep.pct >= 100 ? 'var(--green)' : rep.pct >= 60 ? 'var(--blue)' : 'var(--amber)', borderRadius: 2 }} />
                                </div>
                              )}
                            </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Quick links */}
                  <div className="grid-2" style={{ gap: 10 }}>
                    {[
                      { label: 'Targets', sub: 'Revenue tracking', to: '/sales/targets', icon: '📊' },
                      { label: 'Packages', sub: 'Manage plans', to: '/sales/packages', icon: '📦' },
                      { label: 'Transfer', sub: 'Move members', to: '/sales/transfer', icon: '🔄' },
                      { label: 'Staff', sub: 'Create accounts', to: '/sales/staff', icon: '👥' },
                    ].map(c => (
                      <button key={c.to} onClick={() => navigate(c.to)} style={{
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                        transition: 'border-color 0.12s, box-shadow 0.12s', fontFamily: 'inherit',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{c.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{c.sub}</div>
                      </button>
                    ))}
                  </div>

                  {/* Revenue mini card */}
                  {revenue && (
                    <Card>
                      <CardHeader title="Revenue Snapshot" />
                      <div className="grid-2">
                        <div style={{ background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>This Month</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{fmt(currentMonthRevenue)} EGP</div>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>This Year</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{fmt(revenue.currentYearRevenue)} EGP</div>
                        </div>
                      </div>
                    </Card>
                  )}
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
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
            width: '100%', maxWidth: 500, maxHeight: '80svh', overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Today's Check-Ins ({myCheckIns.length})</h2>
              <button onClick={() => setShowActivity(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, width: 26, height: 26, cursor: 'pointer', color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            {myCheckIns.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--t3)' }}>No check-ins yet today</p>
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
                      <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{entry.member.systemId}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
                        {new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      {entry.checkedInBy?.name && (
                        <div style={{ fontSize: 10, color: 'var(--t4)' }}>by {entry.checkedInBy.name}</div>
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
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
            width: '100%', maxWidth: 600, maxHeight: '80svh', overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Today's Contracts ({todaySubscriptions.length})</h2>
              <button onClick={() => setShowTodaySubs(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, width: 26, height: 26, cursor: 'pointer', color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            {todaySubscriptions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--t3)' }}>No contracts entered today</p>
              </div>
            ) : (
              <div>
                <div style={{ padding: '10px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Total Revenue</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{fmt(todayRevenue)} EGP</span>
                </div>
                {todaySubscriptions.map((entry, i) => (
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
                        #{entry.member.systemId} · {entry.subscription.package?.name ?? 'Package'}
                        {isManager && entry.member.assignedSales?.name && (
                          <span> · Sales: {entry.member.assignedSales.name}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                        {fmt(entry.subscription.pricePaid)} EGP
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--t4)' }}>
                        {entry.subscription.isRenewal ? 'Renewal' : 'New'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
