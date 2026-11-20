import { useCallback, useState } from 'react';
import { Card, EmptyState } from '../../components/ui';
import { getConversionFunnel } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { formatEgp, formatPercent, sourceLabel, tdStyle, thStyle } from './analyticsFormat';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';

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

const STAGE_LABELS = {
  created: tr('Created'),
  stillGuest: tr('Still guest'),
  converted: tr('Converted'),
  renewed: tr('Renewed'),
};

const COLUMNS = [tr('Source'), tr('Leads'), tr('Converted'), tr('Conversion'), tr('Revenue by source')];

export default function FunnelReport() {
  const { t, lang } = useI18n();
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
  const stageLabel = (key, fallback) => (STAGE_LABELS[key] ? t(STAGE_LABELS[key]) : fallback);
  const filters = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: 'var(--t3)' }}>
        {t('From')}
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={{ ...inputStyle, marginInlineStart: 8 }} />
      </label>
      <label style={{ fontSize: 12, color: 'var(--t3)' }}>
        {t('To')}
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} style={{ ...inputStyle, marginInlineStart: 8 }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
        <input
          type="checkbox"
          checked={includeImported}
          onChange={(event) => setIncludeImported(event.target.checked)}
        />
        {t('Include imported data entry')}
      </label>
    </div>
  );

  return (
    <ReportFrame
      title={t('Conversion Funnel')}
      definition={t('People created in this range. Imported data-entry rows are excluded unless you include them. Revenue by source is money collected on subscription start dates, not ad spend.')}
      windowLabel={data ? `${data.from} – ${data.to}` : ''}
      loading={loading}
      error={error}
      toolbar={filters}
    >
      {data && !hasRows && <EmptyState message={t('No new people or collected revenue in this range')} />}
      {data && hasRows && (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {data.stages.map((stage) => {
              const width = created ? Math.max(8, Math.round((stage.count / created) * 100)) : 8;
              return (
                <div key={stage.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{stageLabel(stage.key, stage.label)}</span>
                    <span style={{ color: 'var(--t2)' }}>{stage.count}</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${stage.key === 'created' ? 100 : width}%`, height: '100%', background: 'var(--navy)' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Card style={{ marginBottom: 16 }}>
            {data.dropOff.map((step) => (
              <p key={`${step.from}-${step.to}`} style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--t2)' }}>
                {t('{lost} dropped off between {from} and {to} ({rate}).', {
                  lost: step.lost,
                  from: stageLabel(step.from, step.from),
                  to: stageLabel(step.to, step.to),
                  rate: formatPercent(step.rate),
                })}
              </p>
            ))}
          </Card>
          <Card noPad>
            <div className="table-responsive-container">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS.map((label) => (
                    <th key={label} style={thStyle}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bySource.length === 0 ? (
                  <tr><td style={tdStyle} colSpan={5}>{t('No source rows in this range')}</td></tr>
                ) : data.bySource.map((row) => (
                  <tr key={row.source}>
                    <td style={tdStyle}>{sourceLabel(row.source, t)}</td>
                    <td style={tdStyle}>{row.leads}</td>
                    <td style={tdStyle}>{row.converted}</td>
                    <td style={tdStyle}>{formatPercent(row.conversionRate)}</td>
                    <td style={tdStyle}>{formatEgp(row.revenue, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
