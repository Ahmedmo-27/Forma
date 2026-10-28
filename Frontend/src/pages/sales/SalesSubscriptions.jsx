import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import { PageHeader, Card, Spinner, EmptyState, Avatar, fmtDate } from '../../components/ui';
import { getSalesMySubscriptions } from '../../api/endpoints';

const fmt   = (n) => Number(n ?? 0).toLocaleString('en-EG');
const TODAY = new Date().toISOString().slice(0, 10);

export default function SalesSubscriptions() {
  usePageTitle('My Subscriptions');
  const navigate = useNavigate();

  const [dateFrom,  setDateFrom]  = useState(TODAY);
  const [dateTo,    setDateTo]    = useState(TODAY);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSalesMySubscriptions({ dateFrom, dateTo });
      setData(res.data);
    } catch {
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const entries      = data?.entries ?? [];
  const newCount     = entries.filter(e => !e.subscription.isRenewal).length;
  const renewalCount = entries.filter(e =>  e.subscription.isRenewal).length;
  const isToday      = dateFrom === TODAY && dateTo === TODAY;

  return (
    <Layout>
      <PageHeader title="My Subscriptions" />

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>

        {/* ── Filters ──────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>From</label>
              <input type="date" value={dateFrom} max={dateTo || TODAY}
                onChange={e => setDateFrom(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>To</label>
              <input type="date" value={dateTo} min={dateFrom} max={TODAY}
                onChange={e => setDateTo(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', color: 'var(--t1)', background: 'var(--card)' }}
              />
            </div>
            {!isToday && (
              <button onClick={() => { setDateFrom(TODAY); setDateTo(TODAY); }}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: '1px solid var(--border-md)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--t3)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Back to Today
              </button>
            )}
          </div>
        </Card>

        {/* ── Summary cards ────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Subscriptions', value: data?.count ?? 0,                  color: 'var(--blue)',  accent: 'var(--blue)' },
            { label: 'Revenue',       value: `${fmt(data?.totalRevenue)} EGP`,  color: 'var(--green)', accent: 'var(--green)' },
            { label: 'New Members',   value: newCount,                           color: 'var(--navy)',  accent: 'var(--navy)' },
            { label: 'Renewals',      value: renewalCount,                       color: 'var(--amber)', accent: 'var(--amber)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Table ────────────────────────────────────────────────── */}
        <Card noPad>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div>
          ) : entries.length === 0 ? (
            <EmptyState icon="📋" message="No subscriptions in this period" sub="Try adjusting the date range" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Member', 'Package', 'Price Paid', 'Start Date', 'Expires', 'Type'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i}
                    onClick={() => navigate(`/members/${e.member.systemId}`)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
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
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--green)' }}>{fmt(data?.totalRevenue)} EGP</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>
    </Layout>
  );
}
