import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import { Card, StatCard } from '../../components/ui';
import { getExecutiveSummary } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { formatEgp, formatPercent } from './analyticsFormat';
import { useI18n } from '../../i18n/useI18n';

export default function ExecutiveSummary() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { hasFeature } = useTenant();
  const load = useCallback(() => getExecutiveSummary(), []);
  const { data, loading, error } = useAnalyticsReport(load);
  const openChurn = hasFeature('exec_analytics') ? () => navigate('/reports/churn') : undefined;
  const openForecast = hasFeature('exec_analytics') ? () => navigate('/reports/forecast') : undefined;
  const openFunnel = hasFeature('funnels') ? () => navigate('/reports/funnel') : undefined;
  const openAttendance = hasFeature('exec_analytics') ? () => navigate('/reports/attendance') : undefined;

  return (
    <ReportFrame
      title={t('Executive Summary')}
      definition={t('Whole-gym summary for this month. The forecast is the average of the last three complete months.')}
      windowLabel={t('This month')}
      loading={loading}
      error={error}
    >
      {data && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--t1)', margin: 0 }}>{data.narrative}</p>
            <p style={{ fontSize: 12, color: 'var(--t4)', marginTop: 8, marginBottom: 0 }}>{t('These figures cover the whole gym.')}</p>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12 }}>
            <StatCard label={t('Active members')} value={data.activeMembers} color="brand" onClick={() => navigate('/members')} />
            <StatCard label={t('New members')} value={data.newMembersThisMonth} sub={t('First subscription this month')} color="brand" />
            <StatCard
              label={t('Churn')}
              value={formatPercent(data.churnRate)}
              sub={data.previousChurnRate == null ? t('This month') : t('Last month {rate}', { rate: formatPercent(data.previousChurnRate) })}
              color="warning"
              onClick={openChurn}
            />
            <StatCard label={t('Revenue this month')} value={formatEgp(data.revenueThisMonth, lang)} sub={t('Average {amount}', { amount: formatEgp(data.trailingAverage, lang) })} color="success" />
            <StatCard label={t('Next month forecast')} value={formatEgp(data.forecastNextMonth, lang)} sub={t('Three-month average')} color="success" onClick={openForecast} />
            <StatCard label={t('Lead conversion')} value={formatPercent(data.leadConversionRate)} sub={t('New people this month')} color="blue" onClick={openFunnel} />
            <StatCard label={t('Check-ins this week')} value={data.checkInsThisWeek} sub={t('Monday through today')} color="blue" onClick={openAttendance} />
            <StatCard label={t('Expiring in 30 days')} value={data.expiringIn30Days} color={data.expiringIn30Days > 0 ? 'warning' : 'default'} onClick={openChurn} />
          </div>
        </>
      )}
    </ReportFrame>
  );
}
