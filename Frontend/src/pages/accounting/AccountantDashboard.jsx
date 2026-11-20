import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { hasAccess } from '../../lib/access';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, StatCard, Table, Btn, EmptyState, toLocalDateString, CAIRO_ZONE } from '../../components/ui';
import {
  getPackageExceptions,
  getContracts,
  getSalesManagerRevenue,
} from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

const TODAY = toLocalDateString();

const CAIRO_DATE = { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' };
const CAIRO_DATETIME = {
  timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
};

/** Cairo-zone date helpers that follow the active language (English output matches the shared ui helpers). */
function useCairoDates() {
  const { fmtDate: formatDate, fmtDateTime: formatDateTime } = useFormat();
  return {
    fmtDate: (v) => (v ? formatDate(v, CAIRO_DATE, 'en-GB') : '—'),
    fmtDateTime: (v) => (v ? formatDateTime(v, CAIRO_DATETIME, 'en-US') : '—'),
  };
}

function monthStart() {
  return `${toLocalDateString().slice(0, 7)}-01`;
}

function ExceptionFlag() {
  const { t } = useI18n();
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.4px', background: 'var(--amber-bg)', color: 'var(--amber)',
      border: '1px solid var(--amber-bd)', padding: '2px 7px', borderRadius: 4,
    }}>
      {t('Exception')}
    </span>
  );
}

function QuickLink({ to, label, sub, accent, user, access }) {
  const navigate = useNavigate();
  if (!hasAccess(user, access)) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
        borderInlineStart: `3px solid ${accent}`, padding: '14px 16px', textAlign: 'start',
        cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 12, color: 'var(--t4)' }}>{sub}</p>
    </button>
  );
}

export default function AccountantDashboard() {
  const { t } = useI18n();
  const { fmtDate: fmtDateLocal, fmtNumber } = useFormat();
  const { fmtDate, fmtDateTime } = useCairoDates();
  usePageTitle(t('Dashboard'));
  const { user } = useAuth();
  const { currency = 'EGP' } = useTenant() || {};
  const navigate = useNavigate();
  const fmt = (n) => fmtNumber(n ?? 0);

  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [recentContracts, setRecentContracts] = useState([]);
  const [todayContracts, setTodayContracts] = useState(0);
  const [monthContracts, setMonthContracts] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);

  const load = useCallback(async (attempt = 0) => {
    setLoading(true);
    try {
      const monthKey = TODAY.slice(0, 7);
      const results = await Promise.allSettled([
        getPackageExceptions({ status: 'pending', page: 1, limit: 5 }),
        getContracts({ dateFrom: TODAY, dateTo: TODAY, page: 1, limit: 1 }),
        getContracts({ dateFrom: monthStart(), dateTo: TODAY, page: 1, limit: 1 }),
        getContracts({ page: 1, limit: 5 }),
        getSalesManagerRevenue(),
      ]);

      // Retry once on total failure (Atlas cold-start)
      if (attempt === 0 && results.every(r => r.status === 'rejected')) {
        await new Promise(res => setTimeout(res, 3000));
        return load(1);
      }

      const [pendingRes, todayContractsRes, monthContractsRes, recentRes, revenueRes] = results;

      if (pendingRes.status === 'fulfilled') {
        setPending(pendingRes.value.data.requests ?? []);
        setPendingTotal(pendingRes.value.data.pagination?.total ?? 0);
      }
      if (todayContractsRes.status === 'fulfilled') setTodayContracts(todayContractsRes.value.data.count ?? 0);
      if (monthContractsRes.status === 'fulfilled') setMonthContracts(monthContractsRes.value.data.count ?? 0);
      if (recentRes.status === 'fulfilled') setRecentContracts(recentRes.value.data.contracts ?? []);
      if (revenueRes.status === 'fulfilled') {
        setTodayRevenue(revenueRes.value.data.todayRevenue ?? 0);
        const breakdown = revenueRes.value.data.monthlyBreakdown ?? [];
        const currentMonth = breakdown.find((m) => m.month === monthKey);
        setMonthRevenue(currentMonth?.revenue ?? 0);
      }

      if (results.some(r => r.status === 'rejected')) {
        toast.error(t('Failed to load some dashboard data.'));
      }
    } catch {
      toast.error(t('Failed to load dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useLocationEffect(() => { load(); }, [load]);

  const firstName = user?.name?.split(' ')[0] ?? t('there');
  const dateLabel = fmtDateLocal(new Date(), {
    timeZone: 'Africa/Cairo',
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }, 'en-GB');

  const rowStyle = { borderBottom: '1px solid var(--border)', cursor: 'pointer' };

  return (
    <Layout>
      <PageHeader walkthrough="acct-dash-header" title={t('Dashboard')}>
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>{dateLabel}</span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="acct-dash-board" style={{ paddingTop: 20, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>

        <Card style={{ background: 'linear-gradient(135deg, var(--navy) 0%, #1e3a5f 100%)', border: 'none', color: '#fff' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>{t('Welcome back')}</p>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 8 }}>{firstName}</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, maxWidth: 520 }}>
            {t("Review pending package requests, track contracts you've processed, and monitor revenue — all from one place.")}
          </p>
          {pendingTotal > 0 && (
            <div style={{ marginTop: 14 }}>
              <Btn size="sm" onClick={hasAccess(user, 'package_approvals') ? () => navigate('/accounting/package-requests') : undefined}>
                {pendingTotal !== 1
                  ? t('{count} requests awaiting review', { count: pendingTotal })
                  : t('1 request awaiting review')}
              </Btn>
            </div>
          )}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12 }}>
          <StatCard
            label={t('Pending Requests')}
            value={loading ? '—' : pendingTotal}
            color={pendingTotal > 0 ? 'warning' : 'default'}
            sub={pendingTotal > 0 ? t('Needs your review') : t('All caught up')}
            onClick={hasAccess(user, 'package_approvals') ? () => navigate('/accounting/package-requests') : undefined}
          />
          <StatCard
            label={t("Today's Revenue")}
            value={loading ? '—' : `${fmt(todayRevenue)} ${currency}`}
            color="success"
            sub={todayContracts !== 1
              ? t('{count} contracts today', { count: todayContracts })
              : t('1 contract today')}
            onClick={hasAccess(user, 'targets') ? () => navigate('/sales/targets') : undefined}
          />
          <StatCard
            label={t('This Month')}
            value={loading ? '—' : `${fmt(monthRevenue)} ${currency}`}
            color="brand"
            sub={monthContracts !== 1
              ? t('{count} contracts processed', { count: monthContracts })
              : t('1 contract processed')}
            onClick={hasAccess(user, 'contracts') ? () => navigate('/accounting/contract-history') : undefined}
          />
          <StatCard
            label={t('Recent Contracts')}
            value={loading ? '—' : recentContracts.length}
            color="info"
            sub={t('Latest activity')}
            onClick={hasAccess(user, 'contracts') ? () => navigate('/accounting/contract-history') : undefined}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          <Card noPad>
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t('Pending Package Requests')}</span>
                {pendingTotal > 0 && (
                  <span style={{
                    fontSize: 11, background: 'var(--amber-bg)', color: 'var(--amber)',
                    border: '1px solid var(--amber-bd)', padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                  }}>
                    {pendingTotal}
                  </span>
                )}
              </div>
              <Link to="/accounting/package-requests" style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}>
                {t('View all')}
              </Link>
            </div>
            {!pending.length && !loading
              ? <EmptyState message={t('No pending requests')} sub={t('New sales manager requests will appear here')} />
              : (
                <Table loading={loading} skeletonRows={3} headers={[t('Member'), t('Package'), t('Sales Manager'), t('Price'), t('Submitted')]}>
                  {pending.map((r) => {
                    const memberId = r.member?.systemId ?? r.member?._id;
                    return (
                      <tr
                        key={r._id}
                        className="tbl-row"
                        style={rowStyle}
                        onClick={() => navigate('/accounting/package-requests')}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                          {memberId
                            ? <span onClick={(e) => { e.stopPropagation(); navigate(`/members/${memberId}`); }} style={{ color: 'var(--blue)' }}>{r.member?.name ?? '—'}</span>
                            : (r.member?.name ?? '—')}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                          {r.name}
                          {r.hasException && <div style={{ marginTop: 4 }}><ExceptionFlag /></div>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{r.proposedBy?.name ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}><bdi>EGP {r.pricePaid}</bdi></td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(r.createdAt)}</td>
                      </tr>
                    );
                  })}
                </Table>
              )}
          </Card>

          <Card noPad>
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{t('Recent Contracts')}</span>
              <Link to="/accounting/contract-history" style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}>
                {t('View all')}
              </Link>
            </div>
            {!recentContracts.length && !loading
              ? <EmptyState message={t('No contracts yet')} sub={t('Approved packages and direct assignments appear here')} />
              : (
                <Table loading={loading} skeletonRows={3} headers={[t('Member'), t('Package'), t('Price'), t('Sales Manager'), t('Date')]}>
                  {recentContracts.map((c) => {
                    const memberId = c.member?.systemId ?? c.member?._id;
                    return (
                      <tr
                        key={c._id}
                        className="tbl-row"
                        style={rowStyle}
                        onClick={() => navigate('/accounting/contract-history')}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                          {memberId
                            ? <span onClick={(e) => { e.stopPropagation(); navigate(`/members/${memberId}`); }} style={{ color: 'var(--blue)' }}>{c.member?.name ?? '—'}</span>
                            : (c.member?.name ?? '—')}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{c.package?.name ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}><bdi>EGP {c.pricePaid}</bdi></td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{c.salesManager?.name ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t4)' }}>{fmtDate(c.createdAt)}</td>
                      </tr>
                    );
                  })}
                </Table>
              )}
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <QuickLink user={user} access="package_approvals" to="/accounting/package-requests" label={t('Package Requests')} sub={t('Review & approve packages')} accent="var(--amber)" />
          <QuickLink user={user} access="contracts" to="/accounting/contract-history" label={t('Contract History')} sub={t('All processed contracts')} accent="var(--blue)" />
          <QuickLink user={user} access="targets" to="/sales/targets" label={t('Revenue')} sub={t('Revenue breakdown & reports')} accent="var(--green)" />
          <QuickLink user={user} access="members" to="/members" label={t('Members')} sub={t('Browse member profiles')} accent="var(--navy)" />
        </div>
      </div>
    </Layout>
  );
}
