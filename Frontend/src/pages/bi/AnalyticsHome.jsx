import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import {
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  Avatar,
  Badge,
  Modal,
  Btn,
} from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import useLocationEffect from '../../hooks/useLocationEffect';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import {
  createBiObjective,
  dismissBiInsight,
  getBiDashboard,
  getBiInsights,
  suggestBiObjectives,
} from '../../api/endpoints';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  CreditCard,
  Dumbbell,
  Handshake,
  Info,
  Snowflake,
  Sparkles,
  Table,
  Timer,
  TrendingUp,
  User,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

function formatPiasters(value, currency = 'EGP') {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const pounds = Math.floor(abs / 100).toLocaleString('en-EG');
  const fils = String(abs % 100).padStart(2, '0');
  return `${sign}${currency} ${pounds}.${fils}`;
}

function formatNumberOnly(piasters) {
  const n = Math.round(Number(piasters) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const pounds = Math.floor(abs / 100).toLocaleString('en-EG');
  const fils = String(abs % 100).padStart(2, '0');
  return `${sign}${pounds}.${fils}`;
}

function formatValue(kpi, currency = 'EGP') {
  if (kpi.value == null) return 'Not enough data';
  if (kpi.unit === 'piasters') return formatPiasters(kpi.value, currency);
  if (kpi.unit === 'rate') return `${(Number(kpi.value) * 100).toFixed(1)}%`;
  return Number(kpi.value).toLocaleString('en-EG');
}

function renderDeltaBadge(kpi, currency = 'EGP') {
  if (kpi.delta == null) return null;
  const up = kpi.delta > 0;
  const down = kpi.delta < 0;
  const isZero = kpi.delta === 0;

  // Inverted metrics where increase is unfavorable (e.g. refunds, churn)
  const inverse = ['refundsPiasters', 'churnEvents', 'discountGapPiasters'].includes(kpi.key);
  const isPositive = inverse ? down : up;

  const color = isZero ? 'var(--t4)' : isPositive ? 'var(--green)' : 'var(--amber)';
  const bg = isZero ? 'var(--bg)' : isPositive ? 'var(--green-bg)' : 'var(--amber-bg)';
  const border = isZero ? 'var(--border)' : isPositive ? 'var(--green-bd)' : 'var(--amber-bd)';
  const arrow = up ? '↑' : down ? '↓' : '→';

  const shown =
    kpi.unit === 'piasters'
      ? formatPiasters(Math.abs(kpi.delta), currency)
      : kpi.unit === 'rate'
      ? `${(Math.abs(kpi.delta) * 100).toFixed(1)}%`
      : Math.abs(kpi.delta).toLocaleString();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '2px 8px',
        lineHeight: 1.2,
      }}
    >
      <span>{arrow}</span>
      <span>{isZero ? 'Flat' : `${up ? '+' : '-'}${shown}`} vs prev</span>
    </span>
  );
}

const KPI_CATEGORIES = [
  { id: 'all', label: 'All Telemetry', icon: BarChart3 },
  {
    id: 'financial',
    label: 'Revenue & Sales',
    icon: Wallet,
    keys: ['membershipSalesPiasters', 'ptSalesPiasters', 'refundsPiasters', 'discountGapPiasters'],
  },
  {
    id: 'membership',
    label: 'Members & Retention',
    icon: Users,
    keys: ['activeMembers', 'newJoins', 'renewalRate', 'churnEvents'],
  },
  {
    id: 'operations',
    label: 'Activity & Leads',
    icon: Zap,
    keys: ['checkIns', 'ptSessionsSold', 'ptSessionsUsed', 'peopleAdded', 'peopleConverted'],
  },
];

function InteractiveAreaChart({ points, unit, currency = 'EGP' }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [viewMode, setViewMode] = useState('chart');

  if (!points || !points.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--t4)' }}>
        No historical points recorded for this window
      </div>
    );
  }

  const values = points.map((p) => Number(p.value) || 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  const avg = Math.round(total / (values.length || 1));
  const maxVal = Math.max(...values, 1);
  const minVal = 0;

  const w = 760;
  const h = 200;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const getX = (idx) => padL + (values.length > 1 ? (idx / (values.length - 1)) * chartW : chartW / 2);
  const getY = (val) => padT + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH;

  const polyPoints = points.map((p, idx) => `${getX(idx)},${getY(p.value)}`).join(' ');
  const areaPath =
    `M ${getX(0)},${getY(points[0].value)} ` +
    points.map((p, idx) => `L ${getX(idx)},${getY(p.value)}`).join(' ') +
    ` L ${getX(points.length - 1)},${padT + chartH} L ${getX(0)},${padT + chartH} Z`;

  const formatTick = (val) => {
    if (unit === 'piasters') return `${Math.round(val / 100).toLocaleString()}`;
    return Number(val).toLocaleString();
  };

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div>
      {/* 30-Day Metric Summary Cards */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 8,
              padding: '8px 14px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t4)', letterSpacing: '0.4px' }}>
              30-Day Cumulative
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)', marginTop: 2 }}>
              {unit === 'piasters' ? formatPiasters(total, currency) : total.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 8,
              padding: '8px 14px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t4)', letterSpacing: '0.4px' }}>
              Daily Average
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', marginTop: 2 }}>
              {unit === 'piasters' ? formatPiasters(avg, currency) : avg.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 8,
              padding: '8px 14px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t4)', letterSpacing: '0.4px' }}>
              Peak Recorded
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>
              {unit === 'piasters' ? formatPiasters(maxVal, currency) : maxVal.toLocaleString()}
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            style={{
              background: viewMode === 'chart' ? 'var(--card)' : 'transparent',
              border: viewMode === 'chart' ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              color: viewMode === 'chart' ? 'var(--navy)' : 'var(--t3)',
              boxShadow: viewMode === 'chart' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.12s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <TrendingUp size={14} aria-hidden />
            <span>Trend Chart</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            style={{
              background: viewMode === 'table' ? 'var(--card)' : 'transparent',
              border: viewMode === 'table' ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              color: viewMode === 'table' ? 'var(--navy)' : 'var(--t3)',
              boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.12s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Table size={14} aria-hidden />
            <span>Data Table</span>
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: 240, overflow: 'visible' }}>
            <defs>
              <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--navy)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Subtle horizontal grid lines */}
            {[0, 0.5, 1].map((pct) => {
              const yVal = padT + chartH * (1 - pct);
              const labelVal = minVal + pct * (maxVal - minVal);
              return (
                <g key={pct}>
                  <line
                    x1={padL}
                    y1={yVal}
                    x2={w - padR}
                    y2={yVal}
                    stroke="var(--border)"
                    strokeDasharray={pct === 0 ? 'none' : '3,3'}
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={yVal + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--t4)"
                    fontFamily="inherit"
                  >
                    {formatTick(labelVal)}
                  </text>
                </g>
              );
            })}

            {/* Gradient Area Fill */}
            <path d={areaPath} fill="url(#analyticsGrad)" />

            {/* Trend Polyline */}
            <polyline
              fill="none"
              stroke="var(--navy)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polyPoints}
            />

            {/* Hover Guides & Markers */}
            {points.map((p, idx) => {
              const cx = getX(idx);
              const cy = getY(p.value);
              const isHovered = hoverIndex === idx;
              return (
                <g key={p.date || idx}>
                  <rect
                    x={cx - chartW / (points.length * 2)}
                    y={padT}
                    width={chartW / points.length}
                    height={chartH}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverIndex(idx)}
                    onMouseLeave={() => setHoverIndex(null)}
                  />

                  {isHovered && (
                    <line
                      x1={cx}
                      y1={padT}
                      x2={cx}
                      y2={padT + chartH}
                      stroke="var(--navy)"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                  )}

                  {(isHovered || idx === points.length - 1) && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5 : 3.5}
                      fill="#FFFFFF"
                      stroke="var(--navy)"
                      strokeWidth={isHovered ? 2.5 : 2}
                    />
                  )}
                </g>
              );
            })}

            {/* X-Axis Dates */}
            {[
              0,
              Math.floor(points.length / 4),
              Math.floor(points.length / 2),
              Math.floor((points.length * 3) / 4),
              points.length - 1,
            ]
              .filter((idx, i, arr) => arr.indexOf(idx) === i && idx < points.length)
              .map((idx) => (
                <text
                  key={idx}
                  x={getX(idx)}
                  y={h - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--t4)"
                  fontFamily="inherit"
                >
                  {points[idx].date ? points[idx].date.slice(5) : ''}
                </text>
              ))}
          </svg>

          {/* Interactive Floating Tooltip */}
          {hoveredPoint && hoverIndex !== null && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: `${(getX(hoverIndex) / w) * 100}%`,
                transform: 'translateX(-50%) translateY(-105%)',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '6px 12px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600 }}>{hoveredPoint.date}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>
                {unit === 'piasters'
                  ? formatPiasters(hoveredPoint.value, currency)
                  : `${Number(hoveredPoint.value).toLocaleString()} ${unit}`}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="table-responsive-container" style={{ maxHeight: 280, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'start', padding: '8px 12px', color: 'var(--t3)' }}>Date</th>
                <th style={{ textAlign: 'end', padding: '8px 12px', color: 'var(--t3)' }}>
                  Value {unit === 'piasters' ? `(${currency})` : `(${unit})`}
                </th>
              </tr>
            </thead>
            <tbody>
              {points
                .slice()
                .reverse()
                .map((point) => (
                  <tr key={point.date} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{point.date}</td>
                    <td style={{ textAlign: 'end', padding: '8px 12px', fontWeight: 600, color: 'var(--t1)' }}>
                      {unit === 'piasters' ? formatPiasters(point.value, currency) : Number(point.value).toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberList({ title, rows, empty, icon: ListIcon = User }) {
  return (
    <Card noPad>
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', color: 'var(--icon, var(--navy))' }}><ListIcon size={16} aria-hidden /></span>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--t1)' }}>{title}</h2>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            background: 'var(--bg)',
            color: 'var(--t3)',
            border: '1px solid var(--border)',
          }}
        >
          {rows?.length || 0}
        </span>
      </div>
      {!rows?.length ? (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: 'var(--t3)' }}>
            <Check size={18} aria-hidden />
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>{empty}</div>
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {rows.slice(0, 15).map((row) => (
            <div
              key={row.id || row.systemId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 18px',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar name={row.name} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <Link
                    to={`/members/${row.id}`}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--t1)',
                      textDecoration: 'none',
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--navy)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t1)')}
                  >
                    {row.name}
                  </Link>
                  {row.systemId && <span style={{ fontSize: 11, color: 'var(--t4)' }}>#{row.systemId}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'end', flexShrink: 0, marginLeft: 12 }}>
                {row.ends && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--red)',
                      background: 'var(--red-bg)',
                      border: '1px solid var(--red-bd)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    Ends {row.ends.slice(0, 10)}
                  </span>
                )}
                {row.sessions !== undefined && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--navy)',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {row.sessions} session{row.sessions !== 1 ? 's' : ''} left
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AnalyticsHome() {
  usePageTitle('Analytics');
  const { user } = useAuth();
  const { hasFeature, currency = 'EGP' } = useTenant() || {};
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Layout states
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeFormulaModal, setActiveFormulaModal] = useState(null);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState('membershipSalesPiasters');

  const canSeeInsights = ['Owner', 'General Manager', 'Sales Manager', 'Accountant', 'Coach Manager'].includes(user?.role);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const dash = await getBiDashboard();
      setData(dash.data);
      if (hasFeature('business_intelligence') && canSeeInsights) {
        const [insightRes, suggestRes] = await Promise.all([getBiInsights(), suggestBiObjectives()]);
        setInsights(insightRes.data.insights || []);
        setSuggestions(suggestRes.data.suggestions || []);
      }
    } catch (err) {
      setError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          'Analytics could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }

  useLocationEffect(() => {
    load();
  }, []);

  // Filtered KPIs by Category Tab
  const visibleKpis = useMemo(() => {
    if (!data?.kpis) return [];
    if (activeCategory === 'all') return data.kpis;
    const cat = KPI_CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat?.keys) return data.kpis;
    return data.kpis.filter((kpi) => cat.keys.includes(kpi.key));
  }, [data?.kpis, activeCategory]);

  // Series selector options
  const seriesOptions = useMemo(() => {
    if (!data?.series) return [];
    const configs = [
      {
        key: 'membershipSalesPiasters',
        label: 'Membership Sales',
        icon: CreditCard,
        unit: 'piasters',
        description: 'Daily net sales from new and renewed memberships over the past 30 days',
      },
      {
        key: 'checkIns',
        label: 'Daily Check-Ins',
        icon: Timer,
        unit: 'count',
        description: 'Daily gym attendance and member visit volume over the past 30 days',
      },
      {
        key: 'newJoins',
        label: 'New Joins',
        icon: Handshake,
        unit: 'count',
        description: 'New member subscriptions initiated over the past 30 days',
      },
    ];
    return configs.filter((c) => data.series[c.key]?.length > 0);
  }, [data?.series]);

  const activeSeriesConfig = useMemo(() => {
    return seriesOptions.find((s) => s.key === selectedSeriesKey) || seriesOptions[0];
  }, [seriesOptions, selectedSeriesKey]);

  return (
    <Layout>
      <PageHeader walkthrough="analytics-header" title="Analytics">
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>
          {data?.asOf
            ? `Updated ${new Date(data.asOf).toLocaleString('en-EG', {
                timeZone: data.timezone || 'Africa/Cairo',
              })}`
            : 'Waiting for the first snapshot'}
        </span>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="analytics-board" style={{ paddingTop: 20, paddingBottom: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading && <Skeleton h="140px" />}
        {error && <EmptyState message={error} />}
        {data?.empty && <EmptyState message={data.message} />}

        {data?.stale && !data.empty && (
          <div
            style={{
              background: 'var(--amber-bg)',
              border: '1px solid var(--amber-bd)',
              borderRadius: 10,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <AlertTriangle size={20} color="var(--amber)" aria-hidden />
            <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.4 }}>
              <strong>Snapshot Pending:</strong> The latest telemetry snapshot is older than yesterday. Metrics reflect the last computed interval.
            </div>
          </div>
        )}

        {data && !data.empty && (
          <>
            {/* ── METRICS SECTION ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Category Filter Pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--t1)' }}>
                    Executive Metrics
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--t4)', margin: '2px 0 0' }}>
                    Key performance indicators calculated from verified gym records
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    background: 'var(--bg)',
                    padding: 4,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    flexWrap: 'wrap',
                  }}
                >
                  {KPI_CATEGORIES.map((cat) => {
                    const count =
                      cat.id === 'all'
                        ? data.kpis.length
                        : data.kpis.filter((k) => cat.keys.includes(k.key)).length;
                    if (count === 0 && cat.id !== 'all') return null;
                    const isActive = activeCategory === cat.id;
                    const CatIcon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
                        style={{
                          background: isActive ? 'var(--card)' : 'transparent',
                          border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                          borderRadius: 7,
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? 'var(--navy)' : 'var(--t2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <CatIcon size={14} aria-hidden />
                        <span>{cat.label}</span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 8,
                            background: isActive ? 'var(--navy)' : 'var(--border)',
                            color: isActive ? '#fff' : 'var(--t3)',
                            fontWeight: 700,
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4-Column Balanced KPI Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
                  gap: 14,
                }}
              >
                {visibleKpis.map((kpi) => (
                  <div
                    key={kpi.key}
                    style={{
                      background: 'var(--card)',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      minHeight: 128,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--navy)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(68, 41, 140, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Card Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', lineHeight: 1.3 }}>
                        {kpi.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveFormulaModal(kpi)}
                        title="How this is calculated"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: 'var(--t4)',
                          padding: 0,
                          lineHeight: 1,
                          borderRadius: 4,
                          transition: 'color 0.1s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--navy)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t4)')}
                      >
                        <Info size={14} aria-hidden />
                      </button>
                    </div>

                    {/* Card Value */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      {kpi.value == null ? (
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t4)', fontStyle: 'italic' }}>
                          Not enough data
                        </span>
                      ) : kpi.unit === 'piasters' ? (
                        <>
                          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.5px' }}>
                            {formatNumberOnly(kpi.value)}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)' }}>
                            {currency}
                          </span>
                        </>
                      ) : kpi.unit === 'rate' ? (
                        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.5px' }}>
                          {(Number(kpi.value) * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.5px' }}>
                          {Number(kpi.value).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                      {renderDeltaBadge(kpi, currency) || (
                        <span style={{ fontSize: 11, color: 'var(--t4)', textTransform: 'capitalize' }}>
                          {kpi.grain} window
                        </span>
                      )}
                      {kpi.rate?.insufficient && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--amber)',
                            background: 'var(--amber-bg)',
                            border: '1px solid var(--amber-bd)',
                            padding: '1px 6px',
                            borderRadius: 10,
                          }}
                          title={`Needs at least ${kpi.rate.min} events. Currently ${kpi.rate.sample}.`}
                        >
                          {kpi.rate.sample}/{kpi.rate.min} samples
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── TREND VISUALIZATION SECTION ── */}
            {seriesOptions.length > 0 && (
              <Card noPad>
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--t1)' }}>
                      30-Day Historical Trend
                    </h2>
                    <p style={{ fontSize: 12, color: 'var(--t4)', margin: '2px 0 0' }}>
                      {activeSeriesConfig?.description}
                    </p>
                  </div>

                  {/* Multi-Series Selector Pills */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      background: 'var(--bg)',
                      padding: 4,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      flexWrap: 'wrap',
                    }}
                  >
                    {seriesOptions.map((series) => {
                      const isSelected = selectedSeriesKey === series.key;
                      const SeriesIcon = series.icon;
                      return (
                        <button
                          key={series.key}
                          type="button"
                          onClick={() => setSelectedSeriesKey(series.key)}
                          style={{
                            background: isSelected ? 'var(--card)' : 'transparent',
                            border: isSelected ? '1px solid var(--border)' : '1px solid transparent',
                            borderRadius: 7,
                            padding: '5px 12px',
                            fontSize: 12,
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? 'var(--navy)' : 'var(--t2)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.12s ease',
                          }}
                        >
                          <SeriesIcon size={14} aria-hidden />
                          <span>{series.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  <InteractiveAreaChart
                    points={data.series[selectedSeriesKey] || []}
                    unit={activeSeriesConfig?.unit || 'count'}
                    currency={currency}
                  />
                </div>
              </Card>
            )}

            {/* ── FORECAST / RENEWAL PREDICTOR ── */}
            {data.forecast && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'rgba(68, 41, 140, 0.08)',
                        color: 'var(--navy)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Sparkles size={18} aria-hidden />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
                        Renewal Revenue Forecast
                      </h2>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--t4)' }}>
                        Predictive modeling based on historical renewal & churn patterns
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: data.forecast.insufficient ? 'var(--amber-bg)' : 'var(--green-bg)',
                      color: data.forecast.insufficient ? 'var(--amber)' : 'var(--green)',
                      border: `1px solid ${data.forecast.insufficient ? 'var(--amber-bd)' : 'var(--green-bd)'}`,
                    }}
                  >
                    {data.forecast.insufficient ? 'Calibrating Model' : 'Active Prediction'}
                  </span>
                </div>

                {data.forecast.insufficient || data.forecast.revenuePiasters == null ? (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--t2)' }}>Historical Sample Progression</span>
                      <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
                        {data.forecast.sample || 0} / 20 ended memberships
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, ((data.forecast.sample || 0) / 20) * 100)}%`,
                          background: 'var(--navy)',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>
                      The forecasting engine requires at least 20 historical ended memberships to establish statistically sound churn and renewal curves. Projections will automatically activate once the threshold is met.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 12,
                      background: 'var(--bg)',
                      borderRadius: 8,
                      padding: '14px 16px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>
                      {formatPiasters(data.forecast.revenuePiasters, currency)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>{data.forecast.label}</div>
                  </div>
                )}
              </Card>
            )}

            {/* ── ACTION LISTS / RADAR SECTION ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
              <MemberList
                title="Expiring Soon"
                icon={Clock}
                rows={data.lists?.expiring}
                empty="No memberships end in the next 14 days."
              />
              {hasFeature('exec_analytics') && (
                <MemberList
                  title="At-Risk Members"
                  icon={AlertTriangle}
                  rows={data.lists?.atRisk}
                  empty="No members flagged for quiet or low-visit warning."
                />
              )}
              {hasFeature('pt_tracking') && (
                <MemberList
                  title="PT Sessions Expiring"
                  icon={Dumbbell}
                  rows={data.lists?.ptExpiring}
                  empty="No unused sessions expire in the next 30 days."
                />
              )}
              {data.lists?.frozenDue && (
                <MemberList
                  title="Freezes Ending Today"
                  icon={Snowflake}
                  rows={data.lists.frozenDue}
                  empty="No member freeze periods end today."
                />
              )}
            </div>
          </>
        )}

        {/* ── BUSINESS INTELLIGENCE (PLATINUM) ── */}
        {hasFeature('business_intelligence') && canSeeInsights && (
          <Card>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>What to do next</h2>
            {!insights.length && <p>No insight met its minimum sample. That is expected on a new or small gym.</p>}
            {insights.map((insight) => (
              <article key={insight._id} style={{ paddingBlock: 12, borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>{insight.title}</h3>
                <p style={{ margin: '0 0 8px' }}>{insight.action}</p>
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => dismissBiInsight(insight._id, 'Not useful').then(load)}
                >
                  Dismiss
                </Btn>
              </article>
            ))}
            <h3 style={{ fontSize: 15 }}>Suggested goals</h3>
            {!suggestions.length && <p>Goals appear after 14 daily snapshots.</p>}
            {suggestions.map((suggestion) => (
              <div key={suggestion.key} style={{ paddingBlock: 8 }}>
                <strong>{suggestion.name}</strong>
                <p style={{ fontSize: 13 }}>{suggestion.why}</p>
                {!suggestion.linked && (
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      createBiObjective({
                        templateKey: suggestion.key,
                        target: suggestion.achievable,
                        band: 'achievable',
                        deadline: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
                        why: suggestion.why,
                      }).then(load)
                    }
                  >
                    Use the achievable target
                  </Btn>
                )}
              </div>
            ))}
          </Card>
        )}

        {!hasFeature('business_intelligence') && (
          <Card>
            <p style={{ margin: 0, color: 'var(--t3)', fontSize: 13 }}>
              Cohorts, forecasts, insights, and goals are included on the Platinum tier. The telemetry metrics above are included in your current subscription plan.
            </p>
          </Card>
        )}
      </div>

      {/* ── HOW THIS IS CALCULATED MODAL ── */}
      {activeFormulaModal && (
        <Modal
          open={!!activeFormulaModal}
          title={`Calculation: ${activeFormulaModal.name}`}
          onClose={() => setActiveFormulaModal(null)}
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 4, letterSpacing: '0.4px' }}>
                Operational Meaning
              </div>
              <div style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.5 }}>
                {activeFormulaModal.meaning || 'No description available for this metric.'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 4, letterSpacing: '0.4px' }}>
                Mathematical Formula
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  background: 'var(--bg)',
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  color: 'var(--navy)',
                  lineHeight: 1.4,
                }}
              >
                {activeFormulaModal.formula || 'Direct aggregation'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>Data Source</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginTop: 2 }}>
                  {activeFormulaModal.source || 'Database records'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t4)' }}>Measurement Grain</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'capitalize', marginTop: 2 }}>
                  {activeFormulaModal.grain || 'Daily snapshot'}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
