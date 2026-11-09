import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { Card, EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { useTenant } from '../../context/TenantContext';
import {
  createBiObjective,
  dismissBiInsight,
  getBiDashboard,
  getBiInsights,
  suggestBiObjectives,
} from '../../api/endpoints';

function formatPiasters(value, currency = 'EGP') {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const pounds = Math.floor(abs / 100).toLocaleString('en-EG');
  const fils = String(abs % 100).padStart(2, '0');
  return `${sign}${currency} ${pounds}.${fils}`;
}

function formatValue(kpi, currency = 'EGP') {
  if (kpi.value == null) return 'Not enough data';
  if (kpi.unit === 'piasters') return formatPiasters(kpi.value, currency);
  if (kpi.unit === 'rate') return `${(Number(kpi.value) * 100).toFixed(1)}%`;
  return Number(kpi.value).toLocaleString('en-EG');
}

function deltaText(kpi, currency = 'EGP') {
  if (kpi.delta == null) return null;
  const up = kpi.delta > 0;
  const down = kpi.delta < 0;
  const arrow = up ? '↑' : down ? '↓' : '→';
  const word = up ? 'up' : down ? 'down' : 'flat';
  const shown = kpi.unit === 'piasters' ? formatPiasters(kpi.delta, currency) : kpi.unit === 'rate' ? `${(kpi.delta * 100).toFixed(1)} points` : kpi.delta;
  return `${arrow} ${word} ${shown} vs the previous window`;
}

function HowCalculated({ kpi }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--t3)' }}>How this is calculated</summary>
      <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5, margin: '8px 0 0' }}>{kpi.meaning}</p>
      <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>{kpi.formula}</p>
      <p style={{ fontSize: 12, color: 'var(--t4)' }}>Source: {kpi.source}. Grain: {kpi.grain}.</p>
    </details>
  );
}

function LineChart({ points, unit, currency = 'EGP' }) {
  const values = points.map((point) => Number(point.value) || 0);
  const max = Math.max(...values, 1);
  const width = 640;
  const height = 160;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const coords = values.map((value, index) => `${index * step},${height - (value / max) * (height - 16) - 8}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend" style={{ width: '100%', height: 180 }}>
        <polyline fill="none" stroke="#44298C" strokeWidth="3" points={coords} />
      </svg>
      <div className="table-responsive-container" style={{ marginTop: 8 }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <caption style={{ textAlign: 'start', marginBottom: 6 }}>Same numbers as the chart, {unit}</caption>
          <thead>
            <tr>
              <th style={{ textAlign: 'start' }}>Date</th>
              <th style={{ textAlign: 'end' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {points.slice(-14).map((point) => (
              <tr key={point.date}>
                <td>{point.date}</td>
                <td style={{ textAlign: 'end' }}>{unit === 'piasters' ? formatPiasters(point.value, currency) : point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberList({ title, rows, empty }) {
  return (
    <Card>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>{title}</h2>
      {!rows?.length ? <EmptyState message={empty} /> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.slice(0, 12).map((row) => (
            <li key={row.id || row.systemId} style={{ paddingBlock: 8, borderBottom: '1px solid var(--border)' }}>
              <Link to={`/members/${row.id}`}>{row.name}</Link>
              <span style={{ marginInlineStart: 8, color: 'var(--t3)', fontSize: 12 }}>
                {row.systemId ? `#${row.systemId}` : ''} {row.ends ? `ends ${row.ends.slice(0, 10)}` : ''} {row.sessions ? `${row.sessions} sessions` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function AnalyticsHome() {
  usePageTitle('Analytics');
  const { hasFeature, currency = 'EGP' } = useTenant() || {};
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const dash = await getBiDashboard();
      setData(dash.data);
      if (hasFeature('business_intelligence')) {
        const [insightRes, suggestRes] = await Promise.all([
          getBiInsights(),
          suggestBiObjectives(),
        ]);
        setInsights(insightRes.data.insights || []);
        setSuggestions(suggestRes.data.suggestions || []);
      }
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Analytics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <PageHeader title="Analytics">
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {data?.asOf ? `Updated ${new Date(data.asOf).toLocaleString('en-EG', { timeZone: data.timezone || 'Africa/Cairo' })}` : 'Waiting for the first snapshot'}
        </span>
      </PageHeader>
      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 48, display: 'grid', gap: 16 }}>
        {loading && <Skeleton h="120px" />}
        {error && <EmptyState message={error} />}
        {data?.empty && <EmptyState message={data.message} />}
        {data?.stale && !data.empty && (
          <Card>
            <p style={{ margin: 0 }}>The latest snapshot is older than yesterday. Numbers stay as last saved. They are not filled in.</p>
          </Card>
        )}
        {data && !data.empty && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12 }}>
              {data.kpis.map((kpi) => (
                <div key={kpi.key}>
                  <StatCard label={kpi.name} value={formatValue(kpi, currency)} sub={deltaText(kpi, currency) || kpi.grain} />
                  <HowCalculated kpi={kpi} />
                  {kpi.rate?.insufficient && <p style={{ fontSize: 12, color: 'var(--t3)' }}>Needs at least {kpi.rate.min} events. Currently {kpi.rate.sample}.</p>}
                </div>
              ))}
            </div>
            {data.series?.membershipSalesPiasters?.length > 0 && (
              <Card>
                <h2 style={{ marginTop: 0, fontSize: 16 }}>Membership sales, net of refunds</h2>
                <p style={{ fontSize: 13, color: 'var(--t3)' }}>Each point is one local day. The axis starts at zero. This is the sale date, not a separate payment date.</p>
                <LineChart points={data.series.membershipSalesPiasters} unit="piasters" currency={currency} />
              </Card>
            )}
            {data.forecast && (
              <Card>
                <h2 style={{ marginTop: 0, fontSize: 16 }}>Renewal estimate</h2>
                {data.forecast.insufficient || data.forecast.revenuePiasters == null ? (
                  <p>Not enough ended memberships yet ({data.forecast.sample || 0} of 20).</p>
                ) : (
                  <p>{formatPiasters(data.forecast.revenuePiasters, currency)}. {data.forecast.label}</p>
                )}
              </Card>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
              <MemberList title="Expiring soon" rows={data.lists?.expiring} empty="No memberships end in the next 14 days." />
              {hasFeature('exec_analytics') && <MemberList title="At risk" rows={data.lists?.atRisk} empty="No one matches the quiet or low-visit rule." />}
              {hasFeature('pt_tracking') && <MemberList title="PT sessions expiring" rows={data.lists?.ptExpiring} empty="No unused sessions expire in the next 30 days." />}
              {data.lists?.frozenDue && <MemberList title="Freezes ending today" rows={data.lists.frozenDue} empty="No freeze ends today." />}
            </div>
          </>
        )}
        {hasFeature('business_intelligence') && (
          <Card>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>What to do next</h2>
            {!insights.length && <p>No insight met its minimum sample. That is expected on a new or small gym.</p>}
            {insights.map((insight) => (
              <article key={insight._id} style={{ paddingBlock: 12, borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>{insight.title}</h3>
                <p style={{ margin: '0 0 8px' }}>{insight.action}</p>
                <button type="button" className="btn-outline" style={{ minHeight: 40, padding: '6px 14px', fontSize: 13 }} onClick={() => dismissBiInsight(insight._id, 'Not useful').then(load)}>Dismiss</button>
              </article>
            ))}
            <h3 style={{ fontSize: 15 }}>Suggested goals</h3>
            {!suggestions.length && <p>Goals appear after 14 daily snapshots.</p>}
            {suggestions.map((suggestion) => (
              <div key={suggestion.key} style={{ paddingBlock: 8 }}>
                <strong>{suggestion.name}</strong>
                <p style={{ fontSize: 13 }}>{suggestion.why}</p>
                {!suggestion.linked && (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ minHeight: 40, padding: '6px 14px', fontSize: 13 }}
                    onClick={() => createBiObjective({
                      templateKey: suggestion.key,
                      target: suggestion.achievable,
                      band: 'achievable',
                      deadline: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
                      why: suggestion.why,
                    }).then(load)}
                  >
                    Use the achievable target
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}
        {!hasFeature('business_intelligence') && (
          <Card>
            <p style={{ margin: 0 }}>Cohorts, forecasts, insights, and goals are on the Platinum plan. The counts above are the ones included in this plan.</p>
          </Card>
        )}
      </div>
    </Layout>
  );
}
