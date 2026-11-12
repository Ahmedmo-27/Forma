import { useCallback } from 'react';
import { Card, EmptyState } from '../../components/ui';
import { getRevenueForecast } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { formatEgp, formatMonth } from './analyticsFormat';

function ForecastChart({ actuals, forecast }) {
  const rows = [
    ...actuals.map((row) => ({ month: row.month, revenue: row.revenue, prior: row.priorYearRevenue, forecasted: false })),
    ...forecast.map((row) => ({ month: row.month, revenue: row.revenue, prior: null, forecasted: true })),
  ];
  const max = Math.max(...rows.map((row) => Math.max(row.revenue, row.prior || 0)), 1);
  const width = 720;
  const height = 180;
  const step = width / Math.max(rows.length - 1, 1);
  const y = (value) => height - 20 - ((Number(value) || 0) / max) * (height - 36);
  const collected = rows
    .filter((row) => !row.forecasted)
    .map((row, index) => `${index * step},${y(row.revenue)}`)
    .join(' ');
  const forecastLine = rows
    .map((row, index) => (index >= actuals.length - 1 ? `${index * step},${y(row.revenue)}` : null))
    .filter(Boolean)
    .join(' ');
  const prior = rows
    .map((row, index) => (row.prior == null ? null : `${index * step},${y(row.prior)}`))
    .filter(Boolean)
    .join(' ');
  const splitAt = Math.max(actuals.length - 1, 0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Revenue and forecast">
      <polyline fill="none" stroke="var(--navy)" strokeWidth="2.5" points={collected} />
      <polyline fill="none" stroke="#F59E0B" strokeWidth="2.5" points={forecastLine} />
      {prior && <polyline fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 4" points={prior} />}
      {rows.map((row, index) => (
        <circle
          key={row.month}
          cx={index * step}
          cy={y(row.revenue)}
          r="3"
          fill={row.forecasted ? '#F59E0B' : 'var(--navy)'}
        />
      ))}
      <line
        x1={splitAt * step}
        x2={splitAt * step}
        y1="8"
        y2={height - 16}
        stroke="#E5E7EB"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export default function ForecastReport() {
  const load = useCallback(() => getRevenueForecast(), []);
  const { data, loading, error } = useAnalyticsReport(load);
  const hasMoney = (data?.actuals || []).some((row) => row.revenue > 0) || (data?.trailingAverage || 0) > 0;
  const windowLabel = data?.actuals?.length
    ? `${formatMonth(data.actuals[0].month)} – ${formatMonth(data.forecast[data.forecast.length - 1].month)}`
    : '';

  return (
    <ReportFrame
      title="Revenue Forecast"
      definition="Forecast is the average of the last three complete months of collected revenue. It is not a statistical model. The current month is month-to-date and is left out of the average."
      windowLabel={windowLabel}
      loading={loading}
      error={error}
    >
      {data && !hasMoney && <EmptyState message="No collected revenue in this window yet" />}
      {data && hasMoney && (
        <Card>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 12, color: 'var(--t3)' }}>
            <span>Trailing average: <strong style={{ color: 'var(--t1)' }}>{formatEgp(data.trailingAverage)}</strong></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 3, background: 'var(--navy)', display: 'inline-block' }} /> Collected</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 3, background: '#F59E0B', display: 'inline-block' }} /> Forecast</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 0, borderTop: '2px dashed #94A3B8', display: 'inline-block' }} /> Same month last year</span>
          </div>
          <ForecastChart actuals={data.actuals} forecast={data.forecast} />
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, minWidth: 640 }}>
              {data.actuals.map((row) => (
                <div key={row.month} style={{ flex: 1, minWidth: 72 }}>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{formatMonth(row.month)}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{formatEgp(row.revenue)}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{row.partial ? 'Month to date' : `Last year ${formatEgp(row.priorYearRevenue)}`}</div>
                </div>
              ))}
              {data.forecast.map((row) => (
                <div key={row.month} style={{ flex: 1, minWidth: 72 }}>
                  <div style={{ fontSize: 11, color: '#B45309' }}>{formatMonth(row.month)}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>{formatEgp(row.revenue)}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>Forecast</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </ReportFrame>
  );
}
