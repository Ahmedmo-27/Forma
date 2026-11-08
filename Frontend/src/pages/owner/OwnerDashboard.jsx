import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import { useTenant } from '../../context/TenantContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, CardHeader, StatCard, Spinner,
  Avatar, Badge, EmptyState, fmtDate, Table, fmtDateTime,
} from '../../components/ui';
import {
  getAllMembers,
  getSalesTeam,
  getCoachTeam,
  getRequests,
  getTodayCheckIns,
  getSalesManagerRevenue,
  getPackageExceptions,
  getContracts,
  getReceptionistTeam,
} from '../../api/endpoints';

const fmt = (n) => Number(n ?? 0).toLocaleString();

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const TODAY = new Date().toISOString().slice(0, 10);

export default function OwnerDashboard() {
  usePageTitle('Owner Dashboard');
  const { user } = useAuth();
  const { hasFeature } = useTenant();
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [members, setMembers]       = useState([]);
  const [salesTeam, setSalesTeam]   = useState([]);
  const [coachTeam, setCoachTeam]   = useState([]);
  const [receptionists, setReceptionists] = useState([]);
  const [requests, setRequests]     = useState([]);
  const [checkIns, setCheckIns]     = useState([]);
  const [revenue, setRevenue]       = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentContracts, setRecentContracts] = useState([]);
  const [showActivity, setShowActivity] = useState(false);

  const load = useCallback(async (attempt = 0) => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        getAllMembers({ limit: 10000 }),
        getSalesTeam(),
        getCoachTeam(),
        getReceptionistTeam(),
        getRequests(),
        getTodayCheckIns(),
        getSalesManagerRevenue(),
        getPackageExceptions({ status: 'pending', page: 1, limit: 1 }),
        getContracts({ page: 1, limit: 5 }),
      ]);

      // If everything failed on first attempt, wait and retry once (Atlas cold-start)
      if (attempt === 0 && results.every(r => r.status === 'rejected')) {
        await new Promise(res => setTimeout(res, 3000));
        return load(1);
      }

      const [mRes, stRes, ctRes, rRes, reqRes, ciRes, revRes, pkgRes, contractRes] = results;

      if (mRes.status === 'fulfilled')   setMembers(mRes.value.data.members ?? []);
      if (stRes.status === 'fulfilled')  setSalesTeam(stRes.value.data.team ?? []);
      if (ctRes.status === 'fulfilled')  setCoachTeam((ctRes.value.data.team ?? []).filter(u => u.role === 'Coach'));
      if (rRes.status === 'fulfilled')   setReceptionists(rRes.value.data.team ?? []);
      if (reqRes.status === 'fulfilled') setRequests(reqRes.value.data.requests ?? []);
      if (ciRes.status === 'fulfilled')  setCheckIns(ciRes.value.data.checkIns ?? []);
      if (revRes.status === 'fulfilled') setRevenue(revRes.value.data);
      if (pkgRes.status === 'fulfilled') setPendingCount(pkgRes.value.data.pagination?.total ?? 0);
      if (contractRes.status === 'fulfilled') setRecentContracts(contractRes.value.data.contracts ?? []);
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // derived stats
  const activeMembers  = members.filter(m => m.status === 'active').length;
  const frozenMembers  = members.filter(m => m.status === 'frozen').length;
  const expiredMembers = members.filter(m => m.status === 'expired').length;
  const guestMembers   = members.filter(m => m.status === 'guest').length;
  const pendingReqs    = requests.filter(r => r.status === 'pending').length;
  const salesReps      = salesTeam.filter(u => u.role === 'Sales');
  const monthKey       = TODAY.slice(0, 7);
  const monthRevenue   = revenue?.monthlyBreakdown?.find(m => m.month === monthKey)?.revenue ?? 0;

  // expiring this week
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const expiringSoon = members.filter(m => {
    const sub = m.subscriptions?.at(-1);
    if (!sub?.endDate || m.status !== 'active') return false;
    const end = new Date(sub.endDate);
    return end >= now && end <= weekFromNow;
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <Layout>
      <PageHeader title="Dashboard">
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>{dateLabel}</span>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* Welcome banner */}
            <Card style={{ background: 'linear-gradient(135deg, var(--navy) 0%, #1e3a5f 100%)', border: 'none', color: '#fff', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Welcome back</p>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 8 }}>{firstName}</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, maxWidth: 560 }}>
                Full overview of LEAP — members, sales, coaches, packages and revenue all in one place.
              </p>
            </Card>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard label="Total Members"    value={members.length}   color="brand"    onClick={hasAccess(user, 'members') ? () => navigate('/members') : undefined} />
              <StatCard label="Today's Revenue"  value={`${fmt(revenue?.todayRevenue ?? 0)} EGP`} color="success" onClick={hasAccess(user, 'targets') ? () => navigate('/sales/targets') : undefined} />
              <StatCard label="This Month"       value={`${fmt(monthRevenue)} EGP`}             color="brand"   onClick={hasAccess(user, 'targets') ? () => navigate('/sales/targets') : undefined} />
              <StatCard label="Pending Packages" value={pendingCount}     color={pendingCount > 0 ? 'warning' : 'default'} onClick={hasAccess(user, 'package_approvals') ? () => navigate('/accounting/package-requests') : undefined} />
              <StatCard label="Pending Requests" value={pendingReqs}      color={pendingReqs > 0 ? 'warning' : 'default'}  onClick={hasAccess(user, 'approve_requests') ? () => navigate('/sales/requests') : undefined} />
              <StatCard label="Today's Check-Ins" value={checkIns.length} color="blue"    onClick={() => setShowActivity(true)} />
            </div>

            {/* Main grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>

              {/* Expiring soon */}
              <Card noPad>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Expiring This Week ({expiringSoon.length})</span>
                  {expiringSoon.length > 0 && (
                    <span style={{ fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      Needs Renewal
                    </span>
                  )}
                </div>
                {expiringSoon.length === 0 ? (
                  <EmptyState icon="✓" message="No members expiring this week" />
                ) : (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
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

              {/* Recent contracts */}
              <Card noPad>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>Recent Contracts</span>
                  <span onClick={() => navigate('/accounting/contract-history')} style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>View all →</span>
                </div>
                {recentContracts.length === 0 ? (
                  <EmptyState message="No contracts yet" />
                ) : (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {recentContracts.map(c => (
                      <div key={c._id} onClick={() => navigate(`/members/${c.member?.systemId ?? c.member?._id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Avatar name={c.member?.name ?? '?'} size="sm" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{c.member?.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--t4)' }}>{c.package?.name} · {fmtDate(c.startDate)}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
                          {fmt(c.pricePaid)} EGP
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Team summary + quick links */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>

              {/* Team overview */}
              <Card>
                <CardHeader title="Team Overview">
                  {hasAccess(user, 'teams_overview') && (
                    <span onClick={() => navigate('/owner/teams')} style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>Manage →</span>
                  )}
                </CardHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Sales Reps',    count: salesReps.length,        icon: '💼', route: '/owner/teams' },
                    { label: 'Coaches',       count: coachTeam.length,        icon: '🏋️', route: '/owner/teams' },
                    { label: 'Receptionists', count: receptionists.length,    icon: '🖥️', route: '/owner/teams' },
                  ].map(t => (
                    <div key={t.label} onClick={hasAccess(user, 'teams_overview') ? () => navigate(t.route) : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', cursor: hasAccess(user, 'teams_overview') ? 'pointer' : 'default' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--navy)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <span style={{ fontSize: 20 }}>{t.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{t.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{t.count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Quick links */}
              <Card>
                <CardHeader title="Quick Links" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ...(hasFeature('business_intelligence') && hasAccess(user, ['reports', 'owner_dashboard']) ? [{ label: 'Executive Summary', icon: '📈', to: '/reports/executive', accent: 'var(--navy)' }] : []),
                    { label: 'All Members',       icon: '👥', to: '/members',                      accent: 'var(--navy)', access: 'members' },
                    { label: 'Sales Dashboard',   icon: '📊', to: '/sales/dashboard',              accent: 'var(--blue)', access: 'sales_dashboard' },
                    { label: 'Packages',          icon: '📦', to: '/sales/packages',               accent: 'var(--green)', access: 'packages' },
                    { label: 'Transfer',          icon: '🔄', to: '/tasks',                        accent: 'var(--amber)', access: 'members' },
                    { label: 'Contracts',         icon: '📋', to: '/accounting/contract-history',  accent: 'var(--sky)', access: 'contracts' },
                    { label: 'Revenue',           icon: '💰', to: '/sales/targets',                accent: 'var(--green)', access: 'targets' },
                    { label: 'Pkg Requests',      icon: '🔔', to: '/accounting/package-requests',  accent: 'var(--amber)', access: 'package_approvals' },
                    { label: 'Check-In',          icon: '✅', to: '/checkin',                       accent: 'var(--green)', access: 'check_in' },
                    { label: 'Role Access',       icon: '🛡️', to: '/owner/access',                 accent: 'var(--navy)', access: 'access_control' },
                  ].filter((q) => hasAccess(user, q.access)).map(q => (
                    <button key={q.to} onClick={() => navigate(q.to)} style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${q.accent}`, borderRadius: 7,
                      padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'box-shadow 0.12s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{q.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{q.label}</div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Today's check-ins popup */}
      {showActivity && (
        <div onClick={() => setShowActivity(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)',
            width: '100%', maxWidth: 500, maxHeight: '80svh', overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Today's Check-Ins ({checkIns.length})</h2>
              <button onClick={() => setShowActivity(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, width: 26, height: 26, cursor: 'pointer', color: 'var(--t3)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            {checkIns.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--t3)' }}>No check-ins yet today</p>
              </div>
            ) : (
              <div>
                {checkIns.map((entry, i) => (
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
    </Layout>
  );
}
