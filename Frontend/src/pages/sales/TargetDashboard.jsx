import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, CardHeader, EmptyState, Badge, Avatar, CAIRO_ZONE, toLocalDateString, DashboardSkeleton, StatCardSkeleton, Table, Skeleton, MenuSelect } from '../../components/ui';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { getSalesManagerRevenue, getSubscriptionsByDate, getSalesUsers, getCoachTeam, getAllMembers, getPackages } from '../../api/endpoints';
import { primaryByRole } from '../tasks/taskMembers';
import {
  buildPackageOptions, filterByPackage, sharePercent, subscriptionNet, summarizePackages,
} from './packageSales';
import { ClipboardList, Dumbbell, Package } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const TODAY = toLocalDateString();
const MONTH_START = `${TODAY.slice(0, 7)}-01`;

/** Number and date formatters bound to the active language. */
function useLocaleFmt() {
  const { fmtNumber, fmtDate: fmtLocaleDate } = useFormat();
  return {
    fmt: (n) => fmtNumber(n ?? 0),
    fmtDate: (d) => (d ? fmtLocaleDate(d, { timeZone: CAIRO_ZONE, day: '2-digit', month: 'short', year: 'numeric' }, 'en-GB') : '—'),
    fmtLocaleDate,
  };
}

function _ProgressBar({ value, max, height = 6 }) {
  if (!max) return null;
  const pct    = Math.min(100, Math.round((value / max) * 100));
  const color  = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--blue)' : 'var(--amber)';
  return (
    <div style={{ height, background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  );
}

function Stat({ label, value, sub, color = 'var(--t1)', accent }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderInlineStart: accent ? `3px solid ${accent}` : '1px solid var(--border)',
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Inner tab bar ─────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tab-bar-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '8px 18px', background: 'none', border: 'none',
          borderBottom: `2px solid ${active === t.id ? 'var(--navy)' : 'transparent'}`,
          marginBottom: -1,
          color: active === t.id ? 'var(--t1)' : 'var(--t3)',
          fontSize: 13, fontWeight: active === t.id ? 700 : 400,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          transition: 'color 0.12s',
        }}
          onMouseEnter={e => { if (active !== t.id) e.currentTarget.style.color = 'var(--t2)'; }}
          onMouseLeave={e => { if (active !== t.id) e.currentTarget.style.color = 'var(--t3)'; }}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ── Tab: Today ────────────────────────────────────────────────────────────────
function TodayTab({ data, selectedDate, setSelectedDate, loading }) {
  const { t } = useI18n();
  const { fmt } = useLocaleFmt();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Today KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {loading && !data ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Stat
              label={t("Today's Revenue")}
              value={`${fmt(data?.todayRevenue)} EGP`}
              sub={data?.today}
              accent="var(--blue)"
              color="var(--blue)"
            />
            <Stat
              label={t("This Year's Revenue")}
              value={`${fmt(data?.currentYearRevenue)} EGP`}
              sub={String(data?.currentYear ?? '')}
              accent="var(--green)"
              color="var(--green)"
            />
          </>
        )}
      </div>

      {/* Date picker */}
      <Card>
        <CardHeader title={t('Revenue on a Specific Date')} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {t('Pick a Date')}
            </label>
            <input
              type="date" value={selectedDate} max={TODAY}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
            />
          </div>
          {selectedDate && (
            <button onClick={() => setSelectedDate('')} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border-md)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--t3)', fontFamily: 'inherit' }}>
              {t('Clear')}
            </button>
          )}
        </div>

        {selectedDate && loading && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--bg)', borderRadius: 7, border: '1px solid var(--border)' }} aria-busy="true">
            <Skeleton h="11px" w="40%" />
            <div style={{ marginTop: 10 }}><Skeleton h="28px" w="35%" /></div>
          </div>
        )}
        {selectedDate && !loading && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--bg)', borderRadius: 7, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 6 }}>
              {t('Revenue on {date}', { date: selectedDate })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: data?.selectedDateRevenue > 0 ? 'var(--blue)' : 'var(--t3)' }}>
              {fmt(data?.selectedDateRevenue)} EGP
            </div>
            {data?.selectedDateRevenue === 0 && (
              <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 4 }}>{t('No revenue recorded on this date.')}</div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Monthly ──────────────────────────────────────────────────────────────
function MonthlyTab({ data, loading }) {
  const { t } = useI18n();
  const { fmt } = useLocaleFmt();
  const months = data?.monthlyBreakdown ?? [];
  const maxRevenue = Math.max(...months.map(m => m.revenue), 1);
  const total = months.reduce((s, m) => s + m.revenue, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Stat label={t('12-Month Total')}   value={`${fmt(total)} EGP`}             accent="var(--navy)"  color="var(--navy)" />
            <Stat label={t('Year-to-Date')}     value={`${fmt(data?.currentYearRevenue)} EGP`} accent="var(--green)" color="var(--green)" />
            <Stat label={t('Months Tracked')}   value={months.length}                   accent="var(--sky)"   color="var(--sky)" />
          </>
        )}
      </div>

      {/* Bar chart */}
      {!loading && months.length > 0 && (
        <Card>
          <CardHeader title={t('Monthly Revenue — Last 12 Months')} />
          <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginBottom: 8 }}>
            {[...months].reverse().map(m => {
              const h = Math.max(4, Math.round((m.revenue / maxRevenue) * 110));
              const isCurrentMonth = data?.today?.startsWith(m.month);
              return (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={`${m.month}: ${fmt(m.revenue)} EGP`}>
                  {m.revenue > 0 && (
                    <div style={{ fontSize: 8, color: 'var(--t4)', fontWeight: 600 }}>
                      {m.revenue >= 1000 ? t('{count}k', { count: Math.round(m.revenue / 1000) }) : m.revenue}
                    </div>
                  )}
                  <div style={{
                    width: '100%', height: h, borderRadius: '3px 3px 0 0',
                    background: isCurrentMonth ? 'var(--navy)' : m.revenue > 0 ? 'var(--blue)' : 'var(--border)',
                    opacity: m.revenue === 0 ? 0.3 : 1,
                    transition: 'height 0.3s ease',
                  }} />
                </div>
              );
            })}
          </div>
          <div dir="ltr" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t4)' }}>
            {[...months].reverse().filter((_, i) => i % 3 === 0).map(m => (
              <span key={m.month}>{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Table */}
      <Card noPad>
        <CardHeader title={t('Month-by-Month Breakdown')} />
        {loading ? (
          <Table loading skeletonRows={6} headers={[t('Month'), t('Revenue (EGP)'), t('Subscriptions'), t('Share')]} />
        ) : months.length === 0 ? (
          <EmptyState message={t('No data available')} />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {[t('Month'), t('Revenue (EGP)'), t('Subscriptions'), t('Share')].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const share = total > 0 ? Math.round((m.revenue / total) * 100) : 0;
                const isCurrentMonth = data?.today?.startsWith(m.month);
                return (
                  <tr key={m.month} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px', fontWeight: isCurrentMonth ? 700 : 400, color: 'var(--t1)' }}>
                      {m.month}
                      {isCurrentMonth && (
                        <span style={{ marginInlineStart: 7, fontSize: 10, fontWeight: 600, background: 'var(--navy)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>{t('NOW')}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: m.revenue > 0 ? 'var(--green)' : 'var(--t4)' }}>
                      {fmt(m.revenue)}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{m.salesCount}</td>
                    <td style={{ padding: '10px 16px', minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${share}%`, background: 'var(--blue)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--t4)', flexShrink: 0 }}>{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--t1)' }}>{t('Total')}</td>
                <td style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--navy)' }}>{fmt(total)}</td>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--t2)' }}>{months.reduce((s, m) => s + m.salesCount, 0)}</td>
                <td style={{ padding: '10px 16px' }}></td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Annual ───────────────────────────────────────────────────────────────
function AnnualTab({ data, loading }) {
  const { t } = useI18n();
  const { fmt, fmtLocaleDate } = useLocaleFmt();
  const months = data?.monthlyBreakdown ?? [];
  const yearMonths = months.filter(m => m.month.startsWith(String(data?.currentYear ?? '')));
  const yearTotal  = yearMonths.reduce((s, m) => s + m.revenue, 0);
  const yearSales  = yearMonths.reduce((s, m) => s + m.salesCount, 0);
  const bestMonth  = [...yearMonths].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Stat label={t('{year} Revenue', { year: data?.currentYear })} value={`${fmt(yearTotal)} EGP`} accent="var(--navy)" color="var(--navy)" />
            <Stat label={t('Subscriptions This Year')} value={yearSales} accent="var(--blue)" color="var(--blue)" />
            <Stat label={t('Best Month')} value={bestMonth ? `${bestMonth.month}` : '—'} sub={bestMonth ? `${fmt(bestMonth.revenue)} EGP` : ''} accent="var(--green)" color="var(--green)" />
            <Stat label={t('Monthly Average')} value={yearMonths.length > 0 ? `${fmt(Math.round(yearTotal / yearMonths.length))} EGP` : '—'} accent="var(--amber)" color="var(--amber)" />
          </>
        )}
      </div>

      <Card noPad>
        <CardHeader title={t('{year} Monthly Breakdown', { year: data?.currentYear ?? '' })} />
        {loading ? (
          <Table loading skeletonRows={6} headers={[t('Month'), t('Revenue (EGP)'), t('Subscriptions')]} />
        ) : yearMonths.length === 0 ? (
          <EmptyState message={t('No data for this year')} />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {[t('Month'), t('Revenue (EGP)'), t('Subscriptions')].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearMonths.map(m => {
                const isCurrentMonth = data?.today?.startsWith(m.month);
                return (
                  <tr key={m.month} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px', fontWeight: isCurrentMonth ? 700 : 400, color: 'var(--t1)' }}>
                      {fmtLocaleDate(new Date(m.month + '-01'), { month: 'long', year: 'numeric' }, 'en-GB')}
                      {isCurrentMonth && (
                        <span style={{ marginInlineStart: 7, fontSize: 10, fontWeight: 600, background: 'var(--navy)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>{t('NOW')}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: m.revenue > 0 ? 'var(--green)' : 'var(--t4)' }}>
                      {fmt(m.revenue)}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{m.salesCount}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--t1)' }}>{t('Year Total')}</td>
                <td style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--navy)' }}>{fmt(yearTotal)}</td>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--t2)' }}>{yearSales}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Subscriptions ────────────────────────────────────────────────────────
function SubscriptionsTab() {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState('sales'); // 'sales' | 'coaches'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'sales', label: t('Sales Subscriptions') },
          { id: 'coaches', label: t('Coach Private Sessions') },
        ].map(tabItem => (
          <button key={tabItem.id} onClick={() => setSubTab(tabItem.id)} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: `2px solid ${subTab === tabItem.id ? 'var(--navy)' : 'transparent'}`,
            marginBottom: -1,
            color: subTab === tabItem.id ? 'var(--t1)' : 'var(--t3)',
            fontSize: 13, fontWeight: subTab === tabItem.id ? 700 : 400,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'color 0.12s',
          }}
            onMouseEnter={e => { if (subTab !== tabItem.id) e.currentTarget.style.color = 'var(--t2)'; }}
            onMouseLeave={e => { if (subTab !== tabItem.id) e.currentTarget.style.color = 'var(--t3)'; }}
          >{tabItem.label}</button>
        ))}
      </div>

      {subTab === 'sales' && <SalesSubscriptionsContent />}
      {subTab === 'coaches' && <CoachSessionsContent />}
    </div>
  );
}

// ── Sales Subscriptions Content ───────────────────────────────────────────────
function SalesSubscriptionsContent() {
  const { t } = useI18n();
  const { fmt, fmtDate } = useLocaleFmt();
  const pkgLabel = (label) => {
    if (label === 'Unknown package') return t('Unknown package');
    if (label === 'Selected package') return t('Selected package');
    return label;
  };
  const navigate = useNavigate();
  const [dateFrom,    setDateFrom]    = useState(MONTH_START);
  const [dateTo,      setDateTo]      = useState(TODAY);
  const [salesRepId,  setSalesRepId]  = useState('');
  const [packageId,   setPackageId]   = useState('');
  const [salesReps,   setSalesReps]   = useState([]);
  const [packages,    setPackages]    = useState([]);
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    getSalesUsers()
      .then(r => setSalesReps(r.data.salesUsers ?? []))
      .catch(() => {});
    getPackages({ all: 'true' })
      .then(r => setPackages(r.data.packages ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { dateFrom, dateTo };
      if (salesRepId) params.salesRepId = salesRepId;
      const res = await getSubscriptionsByDate(params);
      setData(res.data);
    } catch {
      toast.error(t('Failed to load subscriptions'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, salesRepId, t]);

  useLocationEffect(() => { load(); }, [load]);

  const allEntries = data?.entries ?? [];
  const packageStats = summarizePackages(allEntries, t);
  const packageOptions = buildPackageOptions(packages, packageStats, packageId, t);
  const entries = filterByPackage(allEntries, packageId);
  const totalRevenue = entries.reduce((s, e) => s + subscriptionNet(e.subscription), 0);
  const newCount     = entries.filter(e => !e.subscription.isRenewal).length;
  const renewalCount = entries.filter(e =>  e.subscription.isRenewal).length;
  const packageRevenueTotal = packageStats.reduce((s, p) => s + p.revenue, 0);

  const resetToToday = () => { setDateFrom(TODAY); setDateTo(TODAY); setSalesRepId(''); setPackageId(''); };
  const showThisMonth = () => { setDateFrom(MONTH_START); setDateTo(TODAY); };
  const isToday = dateFrom === TODAY && dateTo === TODAY && !salesRepId && !packageId;
  const isThisMonth = dateFrom === MONTH_START && dateTo === TODAY;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>

          {/* From */}
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('From')}</label>
            <input type="date" value={dateFrom} max={dateTo || TODAY}
              onChange={e => setDateFrom(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
            />
          </div>

          {/* To */}
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('To')}</label>
            <input type="date" value={dateTo} min={dateFrom} max={TODAY}
              onChange={e => setDateTo(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
            />
          </div>

          {/* Sales rep filter */}
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {t('Sales Rep')}
            </label>
            <MenuSelect
              value={salesRepId}
              onChange={e => setSalesRepId(e.target.value)}
              style={{ width: '100%' }}
              aria-label={t('Sales Rep')}
            >
              <option value="">{t('All Sales Reps')}</option>
              {salesReps.map(r => <option key={r._id} value={r._id}>{r.name} ({t(r.role)})</option>)}
            </MenuSelect>
          </div>

          {/* Package filter */}
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {t('Package')}
            </label>
            <MenuSelect
              value={packageId}
              onChange={e => setPackageId(e.target.value)}
              style={{ width: '100%' }}
              aria-label={t('Package')}
            >
              <option value="">{t('All Packages')}</option>
              {packageOptions.map(p => <option key={p.key} value={p.key}>{pkgLabel(p.label)}</option>)}
            </MenuSelect>
          </div>

          <button
            onClick={showThisMonth}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              border: `1px solid ${isThisMonth ? 'var(--navy)' : 'var(--border-md)'}`,
              background: isThisMonth ? 'var(--navy)' : 'transparent',
              color: isThisMonth ? '#fff' : 'var(--t2)',
            }}
          >
            {t('This month')}
          </button>

          {/* Reset */}
          {!isToday && (
            <button onClick={resetToToday} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border-md)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--t3)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {t('Reset to Today')}
            </button>
          )}
        </div>
      </Card>

      {/* ── Packages sold in the selected range ─────────────────── */}
      <Card noPad>
        <div style={{ padding: '16px 14px 0' }}>
          <CardHeader title={isThisMonth ? t('Packages sold this month') : t('Packages sold')}>
            <span style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 500 }}>
              {packageId ? t('Click the package again to show all') : t('Click a package to filter the list')}
            </span>
          </CardHeader>
        </div>
        {loading ? (
          <Table loading skeletonRows={5} headers={[t('Package'), t('Sold'), t('Revenue (EGP)'), t('Share')]} />
        ) : packageStats.length === 0 ? (
          <EmptyState icon={Package} message={t('No packages sold in this range')} sub={t('Try This month or widen the dates')} />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {[t('Package'), t('Sold'), t('Revenue (EGP)'), t('Share')].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {packageStats.map(p => {
                const share = sharePercent(p.revenue, packageRevenueTotal);
                const selected = packageId === p.key;
                return (
                  <tr
                    key={p.key}
                    onClick={() => setPackageId(selected ? '' : p.key)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected ? 'var(--bg)' : 'transparent' }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--bg)'; }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = selected ? 'var(--bg)' : 'transparent'; }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: selected ? 700 : 500, color: 'var(--t1)' }}>
                      {pkgLabel(p.label)}
                      {p.activityType && (
                        <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'capitalize', marginTop: 1 }}>{t(p.activityType)}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--blue)' }}>{p.count}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--green)' }}>{fmt(p.revenue)}</td>
                    <td style={{ padding: '10px 14px', minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${share}%`, background: selected ? 'var(--navy)' : 'var(--blue)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--t4)', flexShrink: 0 }}>{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* ── Summary cards ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          [
            { label: t('Subscriptions'), value: entries.length,              color: 'var(--blue)',  accent: 'var(--blue)' },
            { label: t('Revenue'),       value: `${fmt(totalRevenue)} EGP`, color: 'var(--green)', accent: 'var(--green)' },
            { label: t('New Members'),   value: newCount,                       color: 'var(--navy)',  accent: 'var(--navy)' },
            { label: t('Renewals'),      value: renewalCount,                   color: 'var(--amber)', accent: 'var(--amber)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderInlineStart: `3px solid ${s.accent}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <Card noPad>
        {loading ? (
          <Table loading skeletonRows={6} headers={[t('Member'), t('Package'), t('Price Paid'), t('Start Date'), t('Expires'), t('Sales Rep'), t('Type')]} />
        ) : entries.length === 0 ? (
          <EmptyState icon={ClipboardList} message={t('No subscriptions found')} sub={t('Try adjusting the date range, package, or sales rep filter')} />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {[t('Member'), t('Package'), t('Price Paid'), t('Start Date'), t('Expires'), t('Sales Rep'), t('Type')].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => navigate(`/members/${e.member.systemId}`)}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={e.member.name} size="sm" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{e.member.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t4)' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{e.member.systemId}</span></div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontSize: 13 }}>
                    {e.subscription.package?.name ?? '—'}
                    {e.subscription.package?.activityType && (
                      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'capitalize', marginTop: 1 }}>{t(e.subscription.package.activityType)}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--green)', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {fmt(subscriptionNet(e.subscription))} EGP
                    {(Number(e.subscription.refundAmount) > 0 || e.subscription.refunded) && (
                      <span style={{ marginInlineStart: 5, fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>{t('Refunded')}</span>
                    )}
                    {e.subscription.cancelReason && !(Number(e.subscription.refundAmount) > 0 || e.subscription.refunded) && (
                      <span style={{ marginInlineStart: 5, fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>{t('Cancelled')}</span>
                    )}
                    {e.subscription.discountPercent > 0 && (
                      <span dir="ltr" style={{ marginInlineStart: 5, fontSize: 10, color: 'var(--amber)', fontWeight: 600, unicodeBidi: 'isolate' }}>-{e.subscription.discountPercent}%</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 12 }}>{fmtDate(e.subscription.startDate)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 12 }}>{fmtDate(e.subscription.endDate)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontSize: 12 }}>
                    {e.member.assignedSales?.name ?? <span style={{ color: 'var(--t4)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: e.subscription.isRenewal ? 'var(--amber-bg)' : 'var(--green-bg)',
                      color:      e.subscription.isRenewal ? 'var(--amber)'    : 'var(--green)',
                      border: `1px solid ${e.subscription.isRenewal ? 'var(--amber-bd)' : 'var(--green-bd)'}`,
                    }}>
                      {e.subscription.isRenewal ? t('Renewal') : t('New')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>{t('Total ({count})', { count: entries.length })}</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--green)' }}>{fmt(totalRevenue)} EGP</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Coach Sessions Content ────────────────────────────────────────────────────
function CoachSessionsContent() {
  const { t } = useI18n();
  const { fmt } = useLocaleFmt();
  const navigate = useNavigate();
  const [team, setTeam] = useState([]);
  const coaches = team.filter((person) => person.role === 'Coach');
  const headCoach = primaryByRole(team, 'Head Coach');
  const [coachId, setCoachId]   = useState('');
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getCoachTeam()
      .then(r => setTeam(r.data.team ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllMembers({ all: 'true' });
      setMembers(res.data.members ?? []);
    } catch {
      toast.error(t('Failed to load members'));
    } finally { setLoading(false); }
  }, [t]);

  useLocationEffect(() => { load(); }, [load]);

  // Filter members that have PT sessions
  const ptMembers = members.filter(m => {
    if (!m.PT_sessions || m.PT_sessions <= 0) return false;
    if (coachId) {
      const mCoachId = m.current_couch?._id || m.current_couch;
      return String(mCoachId) === coachId;
    }
    return true;
  });

  const totalSessions = ptMembers.reduce((s, m) => s + (m.PT_sessions || 0), 0);
  const usedSessions = ptMembers.reduce((s, m) => s + (m.used_PT_sessions || 0), 0);
  const remainingSessions = totalSessions - usedSessions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filter */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {t('Coach')}
            </label>
            <MenuSelect
              value={coachId}
              onChange={e => setCoachId(e.target.value)}
              style={{ width: '100%' }}
              aria-label={t('Coach')}
            >
              <option value="">{t('All Coaches')}</option>
              {coaches.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </MenuSelect>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          [
            { label: t('Members with PT'), value: ptMembers.length, color: 'var(--blue)', accent: 'var(--blue)' },
            { label: t('Total Sessions'), value: totalSessions, color: 'var(--navy)', accent: 'var(--navy)' },
            { label: t('Used'), value: usedSessions, color: 'var(--amber)', accent: 'var(--amber)' },
            { label: t('Remaining'), value: remainingSessions, color: 'var(--green)', accent: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderInlineStart: `3px solid ${s.accent}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))
        )}
      </div>

      {/* Table */}
      <Card noPad>
        {loading ? (
          <Table loading skeletonRows={6} headers={[t('Member'), t('Coach'), t('Total Sessions'), t('Used'), t('Remaining'), t('Price Paid'), t('Status')]} />
        ) : ptMembers.length === 0 ? (
          <EmptyState icon={Dumbbell} message={t('No members with private sessions')} sub={t('Adjust the coach filter or add PT sessions to members')} />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {[t('Member'), t('Coach'), t('Total Sessions'), t('Used'), t('Remaining'), t('Price Paid'), t('Status')].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ptMembers.map(m => {
                const remaining = (m.PT_sessions || 0) - (m.used_PT_sessions || 0);
                return (
                  <tr key={m._id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/members/${m.systemId}`)}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={m.name} size="sm" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--t4)' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{m.systemId}</span></div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                      {m.current_couch?.name || headCoach?.name || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--blue)' }}>{m.PT_sessions || 0}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{m.used_PT_sessions || 0}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: remaining > 0 ? 'var(--green)' : 'var(--red)' }}>{remaining}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--green)' }}>
                      {m.pt_subscriptions?.reduce((s, sub) => s + subscriptionNet(sub), 0)
                        ? `EGP ${fmt(m.pt_subscriptions.reduce((s, sub) => s + subscriptionNet(sub), 0))}`
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge status={m.couch_subscription_status || 'guest'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>{t('Total ({count})', { count: ptMembers.length })}</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--blue)' }}>{totalSessions}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)' }}>{usedSessions}</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--green)' }}>{remainingSessions}</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--green)' }}>
                  EGP {fmt(ptMembers.reduce((s, m) => s + (m.pt_subscriptions?.reduce((a, sub) => a + subscriptionNet(sub), 0) || 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TargetDashboard() {
  const { t } = useI18n();
  usePageTitle(t('Targets'));

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState('today');
  const [selectedDate, setSelectedDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      const res = await getSalesManagerRevenue(params);
      setData(res.data);
    } catch {
      toast.error(t('Failed to load revenue data'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, t]);

  useLocationEffect(() => {
    setData(null);
    load();
  }, [load]);

  const TABS = [
    { id: 'today',         label: t('Today / Date') },
    { id: 'monthly',       label: t('Monthly') },
    { id: 'annual',        label: t('Annual') },
    { id: 'subscriptions', label: t('Subscriptions') },
  ];

  const showBoardSkeleton = loading && !data && tab !== 'subscriptions' && tab !== 'today';

  return (
    <Layout>
      <PageHeader walkthrough="targets-header" title={t('Targets')} />

      <div className="page-wrap" data-walkthrough="targets-board" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'subscriptions' ? (
          <SubscriptionsTab />
        ) : showBoardSkeleton ? (
          <DashboardSkeleton stats={4} listRows={6} />
        ) : (
          <>
            {tab === 'today'         && <TodayTab         data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} loading={loading} />}
            {tab === 'monthly'       && <MonthlyTab       data={data} loading={loading || !data} />}
            {tab === 'annual'        && <AnnualTab        data={data} loading={loading || !data} />}
          </>
        )}
      </div>
    </Layout>
  );
}
