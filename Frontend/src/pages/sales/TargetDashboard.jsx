import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import Layout from '../../components/Layout';
import { PageHeader, Card, CardHeader, EmptyState, Badge, Avatar, fmtDate, toLocalDateString, DashboardSkeleton, StatCardSkeleton, Table, Skeleton, MenuSelect } from '../../components/ui';
import { getSalesManagerRevenue, getSubscriptionsByDate, getSalesUsers, getCoachTeam, getAllMembers, getPackages } from '../../api/endpoints';
import {
  buildPackageOptions, filterByPackage, sharePercent, summarizePackages,
} from './packageSales';
import { ClipboardList, Dumbbell, Package } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n) => Number(n ?? 0).toLocaleString('en-EG');
const TODAY = toLocalDateString();
const MONTH_START = `${TODAY.slice(0, 7)}-01`;

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
      borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--border)',
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
              label="Today's Revenue"
              value={`${fmt(data?.todayRevenue)} EGP`}
              sub={data?.today}
              accent="var(--blue)"
              color="var(--blue)"
            />
            <Stat
              label="This Year's Revenue"
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
        <CardHeader title="Revenue on a Specific Date" />
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Pick a Date
            </label>
            <input
              type="date" value={selectedDate} max={TODAY}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
            />
          </div>
          {selectedDate && (
            <button onClick={() => setSelectedDate('')} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border-md)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--t3)', fontFamily: 'inherit' }}>
              Clear
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
              Revenue on {selectedDate}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: data?.selectedDateRevenue > 0 ? 'var(--blue)' : 'var(--t3)' }}>
              {fmt(data?.selectedDateRevenue)} EGP
            </div>
            {data?.selectedDateRevenue === 0 && (
              <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 4 }}>No revenue recorded on this date.</div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Monthly ──────────────────────────────────────────────────────────────
function MonthlyTab({ data, loading }) {
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
            <Stat label="12-Month Total"   value={`${fmt(total)} EGP`}             accent="var(--navy)"  color="var(--navy)" />
            <Stat label="Year-to-Date"     value={`${fmt(data?.currentYearRevenue)} EGP`} accent="var(--green)" color="var(--green)" />
            <Stat label="Months Tracked"   value={months.length}                   accent="var(--sky)"   color="var(--sky)" />
          </>
        )}
      </div>

      {/* Bar chart */}
      {!loading && months.length > 0 && (
        <Card>
          <CardHeader title="Monthly Revenue — Last 12 Months" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginBottom: 8 }}>
            {[...months].reverse().map(m => {
              const h = Math.max(4, Math.round((m.revenue / maxRevenue) * 110));
              const isCurrentMonth = data?.today?.startsWith(m.month);
              return (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={`${m.month}: ${fmt(m.revenue)} EGP`}>
                  {m.revenue > 0 && (
                    <div style={{ fontSize: 8, color: 'var(--t4)', fontWeight: 600 }}>
                      {m.revenue >= 1000 ? `${Math.round(m.revenue / 1000)}k` : m.revenue}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t4)' }}>
            {[...months].reverse().filter((_, i) => i % 3 === 0).map(m => (
              <span key={m.month}>{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Table */}
      <Card noPad>
        <CardHeader title="Month-by-Month Breakdown" />
        {loading ? (
          <Table loading skeletonRows={6} headers={['Month', 'Revenue (EGP)', 'Subscriptions', 'Share']} />
        ) : months.length === 0 ? (
          <EmptyState message="No data available" />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {['Month', 'Revenue (EGP)', 'Subscriptions', 'Share'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{h}</th>
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
                        <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 600, background: 'var(--navy)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>NOW</span>
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
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--t1)' }}>Total</td>
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
            <Stat label={`${data?.currentYear} Revenue`} value={`${fmt(yearTotal)} EGP`} accent="var(--navy)" color="var(--navy)" />
            <Stat label="Subscriptions This Year" value={yearSales} accent="var(--blue)" color="var(--blue)" />
            <Stat label="Best Month" value={bestMonth ? `${bestMonth.month}` : '—'} sub={bestMonth ? `${fmt(bestMonth.revenue)} EGP` : ''} accent="var(--green)" color="var(--green)" />
            <Stat label="Monthly Average" value={yearMonths.length > 0 ? `${fmt(Math.round(yearTotal / yearMonths.length))} EGP` : '—'} accent="var(--amber)" color="var(--amber)" />
          </>
        )}
      </div>

      <Card noPad>
        <CardHeader title={`${data?.currentYear ?? ''} Monthly Breakdown`} />
        {loading ? (
          <Table loading skeletonRows={6} headers={['Month', 'Revenue (EGP)', 'Subscriptions']} />
        ) : yearMonths.length === 0 ? (
          <EmptyState message="No data for this year" />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {['Month', 'Revenue (EGP)', 'Subscriptions'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{h}</th>
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
                      {new Date(m.month + '-01').toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
                      {isCurrentMonth && (
                        <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 600, background: 'var(--navy)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>NOW</span>
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
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--t1)' }}>Year Total</td>
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
  const [subTab, setSubTab] = useState('sales'); // 'sales' | 'coaches'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'sales', label: 'Sales Subscriptions' },
          { id: 'coaches', label: 'Coach Private Sessions' },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            padding: '8px 18px', background: 'none', border: 'none',
            borderBottom: `2px solid ${subTab === t.id ? 'var(--navy)' : 'transparent'}`,
            marginBottom: -1,
            color: subTab === t.id ? 'var(--t1)' : 'var(--t3)',
            fontSize: 13, fontWeight: subTab === t.id ? 700 : 400,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'color 0.12s',
          }}
            onMouseEnter={e => { if (subTab !== t.id) e.currentTarget.style.color = 'var(--t2)'; }}
            onMouseLeave={e => { if (subTab !== t.id) e.currentTarget.style.color = 'var(--t3)'; }}
          >{t.label}</button>
        ))}
      </div>

      {subTab === 'sales' && <SalesSubscriptionsContent />}
      {subTab === 'coaches' && <CoachSessionsContent />}
    </div>
  );
}

// ── Sales Subscriptions Content ───────────────────────────────────────────────
function SalesSubscriptionsContent() {
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
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, salesRepId]);

  useLocationEffect(() => { load(); }, [load]);

  const allEntries = data?.entries ?? [];
  const packageStats = summarizePackages(allEntries);
  const packageOptions = buildPackageOptions(packages, packageStats, packageId);
  const entries = filterByPackage(allEntries, packageId);
  const totalRevenue = entries.reduce((s, e) => s + (Number(e.subscription.pricePaid) || 0), 0);
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
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>From</label>
            <input type="date" value={dateFrom} max={dateTo || TODAY}
              onChange={e => setDateFrom(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
            />
          </div>

          {/* To */}
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>To</label>
            <input type="date" value={dateTo} min={dateFrom} max={TODAY}
              onChange={e => setDateTo(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
            />
          </div>

          {/* Sales rep filter */}
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Sales Rep
            </label>
            <MenuSelect
              value={salesRepId}
              onChange={e => setSalesRepId(e.target.value)}
              style={{ width: '100%' }}
              aria-label="Sales Rep"
            >
              <option value="">All Sales Reps</option>
              {salesReps.map(r => <option key={r._id} value={r._id}>{r.name} ({r.role})</option>)}
            </MenuSelect>
          </div>

          {/* Package filter */}
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Package
            </label>
            <MenuSelect
              value={packageId}
              onChange={e => setPackageId(e.target.value)}
              style={{ width: '100%' }}
              aria-label="Package"
            >
              <option value="">All Packages</option>
              {packageOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
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
            This month
          </button>

          {/* Reset */}
          {!isToday && (
            <button onClick={resetToToday} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border-md)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--t3)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Reset to Today
            </button>
          )}
        </div>
      </Card>

      {/* ── Packages sold in the selected range ─────────────────── */}
      <Card noPad>
        <div style={{ padding: '16px 14px 0' }}>
          <CardHeader title={isThisMonth ? 'Packages sold this month' : 'Packages sold'}>
            <span style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 500 }}>
              {packageId ? 'Click the package again to show all' : 'Click a package to filter the list'}
            </span>
          </CardHeader>
        </div>
        {loading ? (
          <Table loading skeletonRows={5} headers={['Package', 'Sold', 'Revenue (EGP)', 'Share']} />
        ) : packageStats.length === 0 ? (
          <EmptyState icon={Package} message="No packages sold in this range" sub="Try This month or widen the dates" />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {['Package', 'Sold', 'Revenue (EGP)', 'Share'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)' }}>{h}</th>
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
                      {p.label}
                      {p.activityType && (
                        <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'capitalize', marginTop: 1 }}>{p.activityType}</div>
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
            { label: 'Subscriptions', value: entries.length,              color: 'var(--blue)',  accent: 'var(--blue)' },
            { label: 'Revenue',       value: `${fmt(totalRevenue)} EGP`, color: 'var(--green)', accent: 'var(--green)' },
            { label: 'New Members',   value: newCount,                       color: 'var(--navy)',  accent: 'var(--navy)' },
            { label: 'Renewals',      value: renewalCount,                   color: 'var(--amber)', accent: 'var(--amber)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <Card noPad>
        {loading ? (
          <Table loading skeletonRows={6} headers={['Member', 'Package', 'Price Paid', 'Start Date', 'Expires', 'Sales Rep', 'Type']} />
        ) : entries.length === 0 ? (
          <EmptyState icon={ClipboardList} message="No subscriptions found" sub="Try adjusting the date range, package, or sales rep filter" />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {['Member', 'Package', 'Price Paid', 'Start Date', 'Expires', 'Sales Rep', 'Type'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
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
                        <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{e.member.systemId}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontSize: 13 }}>
                    {e.subscription.package?.name ?? '—'}
                    {e.subscription.package?.activityType && (
                      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'capitalize', marginTop: 1 }}>{e.subscription.package.activityType}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--green)', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {fmt(e.subscription.pricePaid)} EGP
                    {e.subscription.discountPercent > 0 && (
                      <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>-{e.subscription.discountPercent}%</span>
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
                      {e.subscription.isRenewal ? 'Renewal' : 'New'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>Total ({entries.length})</td>
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
  const navigate = useNavigate();
  const [coaches, setCoaches]   = useState([]);
  const [coachId, setCoachId]   = useState('');
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getCoachTeam()
      .then(r => setCoaches((r.data.team ?? []).filter(u => u.role === 'Coach')))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllMembers({ all: 'true' });
      setMembers(res.data.members ?? []);
    } catch {
      toast.error('Failed to load members');
    } finally { setLoading(false); }
  }, []);

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
              Coach
            </label>
            <MenuSelect
              value={coachId}
              onChange={e => setCoachId(e.target.value)}
              style={{ width: '100%' }}
              aria-label="Coach"
            >
              <option value="">All Coaches</option>
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
            { label: 'Members with PT', value: ptMembers.length, color: 'var(--blue)', accent: 'var(--blue)' },
            { label: 'Total Sessions', value: totalSessions, color: 'var(--navy)', accent: 'var(--navy)' },
            { label: 'Used', value: usedSessions, color: 'var(--amber)', accent: 'var(--amber)' },
            { label: 'Remaining', value: remainingSessions, color: 'var(--green)', accent: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))
        )}
      </div>

      {/* Table */}
      <Card noPad>
        {loading ? (
          <Table loading skeletonRows={6} headers={['Member', 'Coach', 'Total Sessions', 'Used', 'Remaining', 'Price Paid', 'Status']} />
        ) : ptMembers.length === 0 ? (
          <EmptyState icon={Dumbbell} message="No members with private sessions" sub="Adjust the coach filter or add PT sessions to members" />
        ) : (
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                {['Member', 'Coach', 'Total Sessions', 'Used', 'Remaining', 'Price Paid', 'Status'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
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
                          <div style={{ fontSize: 11, color: 'var(--t4)' }}>#{m.systemId}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                      {m.current_couch?.name ?? <span style={{ color: 'var(--t4)' }}>Unassigned</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--blue)' }}>{m.PT_sessions || 0}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{m.used_PT_sessions || 0}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: remaining > 0 ? 'var(--green)' : 'var(--red)' }}>{remaining}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--green)' }}>
                      {m.pt_subscriptions?.reduce((s, sub) => s + (sub.pricePaid || 0), 0)
                        ? `EGP ${m.pt_subscriptions.reduce((s, sub) => s + (sub.pricePaid || 0), 0).toLocaleString()}`
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
                <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t1)' }}>Total ({ptMembers.length})</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--blue)' }}>{totalSessions}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)' }}>{usedSessions}</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--green)' }}>{remainingSessions}</td>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--green)' }}>
                  EGP {ptMembers.reduce((s, m) => s + (m.pt_subscriptions?.reduce((a, sub) => a + (sub.pricePaid || 0), 0) || 0), 0).toLocaleString()}
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
  usePageTitle('Targets');

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
      toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useLocationEffect(() => {
    setData(null);
    load();
  }, [load]);

  const TABS = [
    { id: 'today',         label: 'Today / Date' },
    { id: 'monthly',       label: 'Monthly' },
    { id: 'annual',        label: 'Annual' },
    { id: 'subscriptions', label: 'Subscriptions' },
  ];

  const showBoardSkeleton = loading && !data && tab !== 'subscriptions' && tab !== 'today';

  return (
    <Layout>
      <PageHeader walkthrough="targets-header" title="Targets" />

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
