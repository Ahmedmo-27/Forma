import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, EmptyState } from '../../components/ui';
import { getChurnAnalytics } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { SHORT_DATE, formatMonth, formatPercent, tdStyle, thStyle } from './analyticsFormat';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

const COLUMNS = [tr('Month'), tr('Covered at start'), tr('Churned'), tr('Churn rate'), tr('Reactivated')];

export default function ChurnReport() {
  const { t, lang } = useI18n();
  const { fmtDate } = useFormat();
  const navigate = useNavigate();
  const load = useCallback(() => getChurnAnalytics({ months: 12 }), []);
  const { data, loading, error } = useAnalyticsReport(load);
  const hasCoverage = (data?.months || []).some((row) => row.coveredAtStart > 0) || (data?.atRiskCount || 0) > 0;
  const windowLabel = data?.months?.length
    ? `${formatMonth(data.months[0].month, lang)} – ${formatMonth(data.months[data.months.length - 1].month, lang)}`
    : '';

  return (
    <ReportFrame
      title={t('Churn')}
      definition={t('A member churns when coverage ends and they do not renew within 7 days. An open freeze keeps them retained through the freeze end.')}
      windowLabel={windowLabel}
      loading={loading}
      error={error}
    >
      {data && !hasCoverage && <EmptyState message={t('No membership coverage in this window yet')} />}
      {data && hasCoverage && (
        <>
          <Card noPad style={{ marginBottom: 16 }}>
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
                {[...data.months].reverse().map((row) => (
                  <tr key={row.month}>
                    <td style={tdStyle}>{formatMonth(row.month, lang)}</td>
                    <td style={tdStyle}>{row.coveredAtStart}</td>
                    <td style={tdStyle}>{row.churned}</td>
                    <td style={tdStyle}>{formatPercent(row.churnRate)}</td>
                    <td style={tdStyle}>{row.reactivated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
          <Card noPad>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                {t('Coverage ending in 30 days ({count})', { count: data.atRiskCount })}
              </span>
            </div>
            {data.atRisk.length === 0 ? (
              <EmptyState message={t('No members are inside the 30-day window')} />
            ) : (
              data.atRisk.map((member) => (
                <div
                  key={`${member.id || member.name}-${member.coverageEnd}`}
                  onClick={() => member.systemId && navigate(`/members/${member.systemId}`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 18px',
                    borderBottom: '1px solid var(--border)',
                    cursor: member.systemId ? 'pointer' : 'default',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{member.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t4)' }}>{member.systemId ? <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>#{member.systemId}</span> : t('Member')}</div>
                  </div>
                  <div style={{ textAlign: 'end' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                      {member.daysRemaining === 1 ? t('1 day') : t('{count} days', { count: member.daysRemaining })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t4)' }}>{member.coverageEnd ? fmtDate(member.coverageEnd, SHORT_DATE) : '—'}</div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
