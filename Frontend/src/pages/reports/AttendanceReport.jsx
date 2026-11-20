import { useCallback, useMemo, useState } from 'react';
import { format, startOfDay, subDays } from 'date-fns';
import { Card, EmptyState, FilterTabs } from '../../components/ui';
import DateRangePicker from '../../components/DateRangePicker';
import { getAttendanceHeatmap } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { WEEKDAYS } from './analyticsFormat';
import { MoveHorizontal } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { tr } from '../../i18n/translate';

function heatColor(count, max) {
  if (!count || !max) return 'var(--bg)';
  const percent = Math.round((0.18 + 0.82 * (count / max)) * 100);
  return `color-mix(in srgb, var(--navy) ${percent}%, transparent)`;
}

/** 0–23 → 12am, 1am, … 11am, 12pm, 1pm, … 11pm */
function hourLabel(hour, t) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return h < 12 ? t('{hour}am', { hour: twelve }) : t('{hour}pm', { hour: twelve });
}

const DATE_KEY = 'yyyy-MM-dd';

function defaultRange() {
  const today = startOfDay(new Date());
  return { from: subDays(today, 56), to: today };
}

const TYPE_OPTIONS = [
  { value: 'all', label: tr('All') },
  { value: 'gym', label: tr('Regular gym') },
  { value: 'pt', label: tr('PT') },
];

const TYPE_COPY = {
  all: { total: tr('{count} visits'), empty: tr('No check-ins or PT sessions in this window') },
  gym: { total: tr('{count} check-ins'), empty: tr('No check-ins in this window') },
  pt: { total: tr('{count} PT sessions'), empty: tr('No PT sessions in this window') },
};

function formatRate(value) {
  return value === null || value === undefined ? '—' : value.toFixed(2);
}

function formatShare(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function SegmentColumn({ title, visitLabel, segment }) {
  const { t } = useI18n();
  const stats = [
    { label: visitLabel, value: segment.visits },
    { label: t('Members'), value: segment.members },
    { label: t('Visits per member'), value: formatRate(segment.visitsPerMember), strong: true },
    { label: t('Share of visits'), value: formatShare(segment.share) },
  ];
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {stats.map((stat) => (
          <div key={stat.label}>
            <div style={{ fontSize: stat.strong ? 22 : 18, fontWeight: 800, color: stat.strong ? 'var(--navy)' : 'var(--t1)' }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AttendanceReport() {
  const { t } = useI18n();
  const [range, setRange] = useState(defaultRange);
  const [type, setType] = useState('all');
  const fromKey = format(range.from, DATE_KEY);
  const toKey = format(range.to, DATE_KEY);
  const load = useCallback(() => getAttendanceHeatmap({ from: fromKey, to: toKey, type }), [fromKey, toKey, type]);
  const { data, loading, error } = useAnalyticsReport(load);
  const max = Math.max(...(data?.grid || []).map((cell) => cell.count), 0);
  const windowLabel = data ? `${data.from} – ${data.to}` : '';
  const copy = TYPE_COPY[type] || TYPE_COPY.all;
  const typeOptions = useMemo(() => TYPE_OPTIONS.map((option) => ({ ...option, label: t(option.label) })), [t]);
  const toolbar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <DateRangePicker value={range} onChange={setRange} loading={loading} />
      <FilterTabs options={typeOptions} active={type} onChange={setType} />
    </div>
  );

  return (
    <ReportFrame
      title={t('Attendance')}
      definition={t('Attendance over the selected period (pick a day, a week, or any range), by weekday and hour. Regular gym counts front-desk check-ins, PT counts sessions a coach logged against a PT pack, and All adds the two. Use peak times to coordinate coach shifts. Empty hours stay in the grid.')}
      windowLabel={windowLabel}
      loading={loading}
      error={error}
      toolbar={toolbar}
    >
      {data?.segments && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 12 }}>
            {t('Attendance rate by package type for this period. Members are people holding that kind of package at any point in the range.')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <SegmentColumn title={t('Regular gym packages')} visitLabel={t('Check-ins')} segment={data.segments.gym} />
            <SegmentColumn title={t('PT packages')} visitLabel={t('PT sessions')} segment={data.segments.pt} />
          </div>
        </Card>
      )}
      {data && data.totalCheckIns === 0 && (
        <EmptyState message={t(copy.empty)} sub={t('{start} to {end}', { start: data.from, end: data.to })} />
      )}
      {data && data.totalCheckIns > 0 && (
        <>
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>
            {t(copy.total, { count: data.totalCheckIns })}
          </p>
          <p className="sm:hidden" style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><MoveHorizontal size={12} aria-hidden /> {t('Swipe horizontally to view all 24 hours')}</p>
          <div className="table-responsive-container">
          <Card style={{ overflowX: 'auto', marginBottom: 16 }}>
            <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: '52px repeat(24, minmax(36px, 1fr))', gap: 3, minWidth: 920 }}>
              <div />
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{ fontSize: 9, color: 'var(--t4)', textAlign: 'center', lineHeight: 1.2 }}>
                  {hourLabel(hour, t)}
                </div>
              ))}
              {WEEKDAYS.map((label, dow) => (
                <div key={label} style={{ display: 'contents' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', alignSelf: 'center' }}>{t(label)}</div>
                  {data.grid.filter((cell) => cell.dow === dow).map((cell) => (
                    <div
                      key={`${cell.dow}-${cell.hour}`}
                      title={`${t(label)} ${hourLabel(cell.hour, t)} · ${cell.count}`}
                      style={{
                        height: 28,
                        borderRadius: 4,
                        background: heatColor(cell.count, max),
                        color: cell.count / (max || 1) > 0.55 ? '#fff' : 'var(--t1)',
                        fontSize: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {cell.count || ''}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
          </div>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{t('Daily totals')}</div>
            <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 88, overflowX: 'auto' }}>
              {data.days.map((day) => {
                const dayMax = Math.max(...data.days.map((row) => row.count), 1);
                return (
                  <div key={day.date} title={`${day.date}: ${day.count}`} style={{ flex: '1 0 8px', display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                    <div style={{
                      width: '100%',
                      height: `${Math.max(4, (day.count / dayMax) * 100)}%`,
                      background: day.count ? 'var(--navy)' : 'var(--border)',
                      borderRadius: 2,
                    }} />
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
