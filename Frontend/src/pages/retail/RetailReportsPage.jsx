import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Receipt } from 'lucide-react';
import { Btn, EmptyState, MenuSelect, Spinner, StatCard } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { getRetailSummary } from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';
import {
  PAYMENT_LABELS,
  RetailLayout,
  addDays,
  cardStyle,
  dateKey,
  downloadCsv,
  errorMessage,
  pickValue,
  tdNum,
  tdStyle,
  thStyle,
  useMoney,
  useRetailBranch,
} from './retailShared';

const PRESETS = [
  { id: 'today', label: tr('Today') },
  { id: '7', label: tr('Last 7 days') },
  { id: '30', label: tr('Last 30 days') },
  { id: 'month', label: tr('This month') },
];

function presetRange(id) {
  const today = dateKey();
  if (id === 'today') return { from: today, to: today };
  if (id === '7') return { from: addDays(today, -6), to: today };
  if (id === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: addDays(today, -29), to: today };
}

const filterLabelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--t3)',
  marginBottom: 6,
  letterSpacing: '0.3px',
};

const filterControlStyle = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--t1)',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function RetailReportsPage() {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  const money = useMoney();
  usePageTitle(t('Retail revenue'));
  const branch = useRetailBranch();
  const { branchId } = branch;

  const initial = presetRange('30');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [vendorId, setVendorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [vendorChoices, setVendorChoices] = useState([]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const params = { locationId: branchId, dateFrom: from, dateTo: to };
      if (vendorId) params.vendorId = vendorId;
      const { data } = await getRetailSummary(params);
      setReport(data);
      if (!vendorId) setVendorChoices(data.vendors || []);
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to load revenue')));
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to, vendorId, t]);

  useEffect(() => { load(); }, [load]);

  const maxDay = useMemo(
    () => Math.max(1, ...((report?.daily || []).map((d) => d.net))),
    [report],
  );

  function exportCsv() {
    if (!report) return;
    const rows = [
      [t('Retail revenue'), t('{start} to {end}', { start: report.range.dateFrom, end: report.range.dateTo })],
      [],
      [t('Vendor'), t('Type'), t('Gym share %'), t('Sales'), t('Units'), t('Net revenue'), t('Gym earns'), t('Vendor earns'), t('Refunded')],
      ...report.vendors.map((v) => [v.vendorName, v.type, v.commissionPercent, v.sales, v.units, v.net, v.gymShare, v.vendorShare, v.refunded]),
      [t('All vendors'), '', '', report.totals.sales, report.totals.units, report.totals.net, report.totals.gymShare, report.totals.vendorShare, report.totals.refunded],
      [],
      [t('Product'), t('Vendor'), t('Units'), t('Net revenue')],
      ...report.topProducts.map((p) => [p.name, p.vendorName, p.units, p.net]),
      [],
      [t('Date'), t('Net revenue')],
      ...report.daily.map((d) => [d.date, d.net]),
    ];
    downloadCsv(`retail-revenue-${report.range.dateFrom}-to-${report.range.dateTo}.csv`, rows);
  }

  const totals = report?.totals;
  const activePreset = PRESETS.find((p) => {
    const range = presetRange(p.id);
    return range.from === from && range.to === to;
  })?.id;

  return (
    <RetailLayout
      title={t('Retail revenue')}
      branch={branch}
      actions={<Btn variant="ghost" size="sm" onClick={exportCsv} disabled={!report}><Download size={14} /> {t('Export CSV')}</Btn>}
    >
      {!branchId && <EmptyState icon={Receipt} message={t('Select a branch')} sub={t('Revenue is reported per branch.')} />}
      {branchId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESETS.map((p) => {
                const active = p.id === activePreset;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { const r = presetRange(p.id); setFrom(r.from); setTo(r.to); }}
                    style={{
                      padding: '0 14px',
                      height: 40,
                      borderRadius: 8,
                      border: `1px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
                      background: active ? 'color-mix(in srgb, var(--navy) 12%, var(--card))' : 'var(--card)',
                      color: active ? 'var(--navy)' : 'var(--t2)',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    {t(p.label)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginInlineStart: 'auto' }}>
              <label style={{ width: 158 }}>
                <span style={filterLabelStyle}>{t('From')}</span>
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={filterControlStyle} />
              </label>
              <label style={{ width: 158 }}>
                <span style={filterLabelStyle}>{t('To')}</span>
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={filterControlStyle} />
              </label>
              <div style={{ width: 210 }}>
                <div style={filterLabelStyle}>{t('Vendor')}</div>
                <MenuSelect
                  value={vendorId}
                  onChange={(e) => setVendorId(pickValue(e))}
                  options={[{ value: '', label: t('All vendors') }, ...vendorChoices.map((v) => ({ value: v.vendorId, label: v.vendorName }))]}
                  style={{ height: 40, boxSizing: 'border-box', fontWeight: 600 }}
                />
              </div>
            </div>
          </div>

          {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="lg" /></div>}

          {!loading && report && (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <StatCard label={vendorId ? t('Vendor revenue') : t('Total revenue (all vendors)')} value={money(totals.net)} sub={t('{sales} sales · {units} units', { sales: fmtNumber(totals.sales), units: fmtNumber(totals.units) })} />
                <StatCard label={t('Gym earns')} value={money(totals.gymShare)} color="green" />
                <StatCard label={t('Vendors earn')} value={money(totals.vendorShare)} />
                <StatCard label={t('Refunded')} value={money(totals.refunded)} color="red" />
                <StatCard label={t('Low stock items')} value={fmtNumber(report.lowStockCount)} sub={t('Tracked products at or below their alert level')} />
              </div>

              <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
                <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{t('Revenue per vendor')}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{t('Vendor')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Gym share')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Sales')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Net revenue')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Gym earns')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('Vendor earns')}</th>
                      <th style={{ ...thStyle, textAlign: 'end' }}>{t('% of total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.vendors.map((v) => (
                      <tr key={v.vendorId} style={{ opacity: v.active ? 1 : 0.6 }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t1)' }}><bdi>{v.vendorName}</bdi>{!v.active ? ` ${t('(inactive)')}` : ''}</td>
                        <td style={tdNum}>{fmtNumber(v.commissionPercent)}%</td>
                        <td style={tdNum}>{fmtNumber(v.sales)}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{money(v.net)}</td>
                        <td style={tdNum}>{money(v.gymShare)}</td>
                        <td style={tdNum}>{v.type === 'external' ? money(v.vendorShare) : '-'}</td>
                        <td style={tdNum}>{totals.net > 0 ? `${fmtNumber((v.net / totals.net) * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '-'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--t1)' }}>{t('All vendors')}</td>
                      <td style={tdNum} />
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtNumber(totals.sales)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.net)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.gymShare)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{money(totals.vendorShare)}</td>
                      <td style={tdNum}>{totals.net > 0 ? '100%' : '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {report.daily.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)', marginBottom: 12 }}>{t('Daily revenue')}</div>
                  <div dir="ltr">
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, overflowX: 'auto' }}>
                      {report.daily.map((d) => (
                        <div key={d.date} title={`${d.date}: ${money(d.net)}`} style={{ flex: '1 0 14px', minWidth: 14, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                          <div style={{ height: `${Math.max(2, (d.net / maxDay) * 100)}%`, background: 'var(--navy)', borderRadius: '4px 4px 0 0' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t4)', marginTop: 6 }}>
                      <span>{report.daily[0].date}</span>
                      <span>{report.daily[report.daily.length - 1].date}</span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ ...cardStyle, flex: '2 1 380px', padding: 0, overflowX: 'auto' }}>
                  <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{t('Top products')}</div>
                  {report.topProducts.length === 0 ? (
                    <p style={{ padding: '0 14px 14px', margin: 0, fontSize: 13, color: 'var(--t4)' }}>{t('No sales in this period.')}</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>{t('Product')}</th>
                          <th style={thStyle}>{t('Vendor')}</th>
                          <th style={{ ...thStyle, textAlign: 'end' }}>{t('Units')}</th>
                          <th style={{ ...thStyle, textAlign: 'end' }}>{t('Revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.topProducts.map((p) => (
                          <tr key={p.productId}>
                            <td style={tdStyle}>{p.name}</td>
                            <td style={tdStyle}>{p.vendorName}</td>
                            <td style={tdNum}>{fmtNumber(p.units)}</td>
                            <td style={tdNum}>{money(p.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div style={{ ...cardStyle, flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)', marginBottom: 10 }}>{t('By payment method')}</div>
                  {report.paymentMethods.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--t4)' }}>{t('No sales in this period.')}</p>}
                  {report.paymentMethods.map((m) => (
                    <div key={m.method} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--t2)' }}>
                      <span>{PAYMENT_LABELS[m.method] ? t(PAYMENT_LABELS[m.method]) : m.method}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(m.net)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </RetailLayout>
  );
}
