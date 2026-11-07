import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import { Card, StatCard } from '../../components/ui';
import { getExecutiveSummary } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { formatEgp, formatPercent } from './analyticsFormat';

export default function ExecutiveSummary() {
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
      title="Executive Summary"
      definition="Whole-gym summary for this month. The forecast is the average of the last three complete months."
      windowLabel="This month"
      loading={loading}
      error={error}
    >
      {data && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--t1)', margin: 0 }}>{data.narrative}</p>
            <p style={{ fontSize: 12, color: 'var(--t4)', marginTop: 8, marginBottom: 0 }}>These figures cover the whole gym.</p>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <StatCard label="Active members" value={data.activeMembers} color="brand" onClick={() => navigate('/members')} />
            <StatCard label="New members" value={data.newMembersThisMonth} sub="First subscription this month" color="brand" />
            <StatCard
              label="Churn"
              value={formatPercent(data.churnRate)}
              sub={data.previousChurnRate == null ? 'This month' : `Last month ${formatPercent(data.previousChurnRate)}`}
              color="warning"
              onClick={openChurn}
            />
            <StatCard label="Revenue this month" value={formatEgp(data.revenueThisMonth)} sub={`Average ${formatEgp(data.trailingAverage)}`} color="success" />
            <StatCard label="Next month forecast" value={formatEgp(data.forecastNextMonth)} sub="Three-month average" color="success" onClick={openForecast} />
            <StatCard label="Lead conversion" value={formatPercent(data.leadConversionRate)} sub="New people this month" color="blue" onClick={openFunnel} />
            <StatCard label="Check-ins this week" value={data.checkInsThisWeek} sub="Monday through today" color="blue" onClick={openAttendance} />
            <StatCard label="Expiring in 30 days" value={data.expiringIn30Days} color={data.expiringIn30Days > 0 ? 'warning' : 'default'} onClick={openChurn} />
          </div>
        </>
      )}
    </ReportFrame>
  );
}
