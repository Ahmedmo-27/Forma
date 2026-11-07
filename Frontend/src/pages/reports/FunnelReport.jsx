import { useCallback, useState } from 'react';
import { Card, EmptyState } from '../../components/ui';
import { getConversionFunnel } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { formatEgp, formatPercent, tdStyle, thStyle } from './analyticsFormat';

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const inputStyle = {
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--t1)',
  fontFamily: 'inherit',
};

export default function FunnelReport() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayKey);
  const [includeImported, setIncludeImported] = useState(false);
  const load = useCallback(
    () => getConversionFunnel({ from, to, includeImported: includeImported ? '1' : '0' }),
    [from, to, includeImported],
  );
  const { data, loading, error } = useAnalyticsReport(load);
  const created = data?.stages?.find((stage) => stage.key === 'created')?.count || 0;
  const hasRows = created > 0 || (data?.bySource || []).length > 0;
  const filters = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: 'var(--t3)' }}>
        From
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={{ ...inputStyle, marginLeft: 8 }} />
      </label>
      <label style={{ fontSize: 12, color: 'var(--t3)' }}>
        To
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} style={{ ...inputStyle, marginLeft: 8 }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
        <input
          type="checkbox"
          checked={includeImported}
          onChange={(event) => setIncludeImported(event.target.checked)}
        />
        Include imported data entry
      </label>
    </div>
  );

  return (
    <ReportFrame
      title="Conversion Funnel"
      definition="People created in this range. Imported data-entry rows are excluded unless you include them. Revenue by source is money collected on subscription start dates, not ad spend."
      windowLabel={data ? `${data.from} – ${data.to}` : ''}
      loading={loading}
      error={error}
      toolbar={filters}
    >
      {data && !hasRows && <EmptyState message="No new people or collected revenue in this range" />}
      {data && hasRows && (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {data.stages.map((stage) => {
              const width = created ? Math.max(8, Math.round((stage.count / created) * 100)) : 8;
              return (
                <div key={stage.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{stage.label}</span>
                    <span style={{ color: 'var(--t2)' }}>{stage.count}</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${stage.key === 'created' ? 100 : width}%`, height: '100%', background: '#44298C' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Card style={{ marginBottom: 16 }}>
            {data.dropOff.map((step) => {
              const labels = { created: 'Created', converted: 'Converted', renewed: 'Renewed' };
              return (
                <p key={`${step.from}-${step.to}`} style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--t2)' }}>
                  {step.lost} dropped off between {labels[step.from]} and {labels[step.to]} ({formatPercent(step.rate)}).
                </p>
              );
            })}
          </Card>
          <Card noPad style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Source', 'Leads', 'Converted', 'Conversion', 'Revenue by source'].map((label) => (
                    <th key={label} style={thStyle}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bySource.length === 0 ? (
                  <tr><td style={tdStyle} colSpan={5}>No source rows in this range</td></tr>
                ) : data.bySource.map((row) => (
                  <tr key={row.source}>
                    <td style={tdStyle}>{row.source}</td>
                    <td style={tdStyle}>{row.leads}</td>
                    <td style={tdStyle}>{row.converted}</td>
                    <td style={tdStyle}>{formatPercent(row.conversionRate)}</td>
                    <td style={tdStyle}>{formatEgp(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
