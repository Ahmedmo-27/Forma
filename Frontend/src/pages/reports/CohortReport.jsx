import { useCallback } from 'react';
import { Card, EmptyState } from '../../components/ui';
import { getRetentionCohorts } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { formatMonth, formatPercent, tdStyle, thStyle } from './analyticsFormat';

function cellColor(rate) {
  if (rate == null) return 'transparent';
  const alpha = 0.12 + rate * 0.78;
  return `rgba(22, 163, 74, ${alpha})`;
}

export default function CohortReport() {
  const load = useCallback(() => getRetentionCohorts({ months: 12 }), []);
  const { data, loading, error } = useAnalyticsReport(load);
  const hasCohorts = (data?.cohorts || []).some((row) => row.size > 0);
  const windowLabel = data?.cohorts?.length
    ? `${formatMonth(data.cohorts[0].cohort)} – ${formatMonth(data.cohorts[data.cohorts.length - 1].cohort)}`
    : '';

  return (
    <ReportFrame
      title="Retention Cohorts"
      definition="Each row is the month of a member's first subscription. Cells show the share still covered at the end of that month and the months after it. A member who comes back is covered again."
      windowLabel={windowLabel}
      loading={loading}
      error={error}
    >
      {data && !hasCohorts && <EmptyState message="No first subscriptions in this window yet" />}
      {data && hasCohorts && (
        <Card noPad>
          <div className="table-responsive-container">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thStyle}>Size</th>
                {Array.from({ length: 12 }, (_, index) => (
                  <th key={index} style={{ ...thStyle, textAlign: 'center' }}>M{index}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.filter((row) => row.size > 0).map((row) => (
                <tr key={row.cohort}>
                  <td style={tdStyle}>{formatMonth(row.cohort)}</td>
                  <td style={tdStyle}>{row.size}</td>
                  {row.retention.map((rate, index) => (
                    <td
                      key={`${row.cohort}-${index}`}
                      style={{
                        ...tdStyle,
                        textAlign: 'center',
                        background: cellColor(rate),
                        color: rate != null && rate > 0.65 ? '#fff' : 'var(--t1)',
                      }}
                    >
                      {rate == null ? '—' : formatPercent(rate)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </ReportFrame>
  );
}
