import { useCallback } from 'react';
import { Card, EmptyState } from '../../components/ui';
import { getAttendanceHeatmap } from '../../api/endpoints';
import ReportFrame from './ReportFrame';
import useAnalyticsReport from './useAnalyticsReport';
import { WEEKDAYS } from './analyticsFormat';
import { MoveHorizontal } from 'lucide-react';

function heatColor(count, max) {
  if (!count || !max) return 'var(--bg)';
  const alpha = 0.18 + 0.82 * (count / max);
  return `rgba(68, 41, 140, ${alpha})`;
}

/** 0–23 → 12am, 1am, … 11am, 12pm, 1pm, … 11pm */
function hourLabel(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

export default function AttendanceReport() {
  const load = useCallback(() => getAttendanceHeatmap({ weeks: 8 }), []);
  const { data, loading, error } = useAnalyticsReport(load);
  const max = Math.max(...(data?.grid || []).map((cell) => cell.count), 0);
  const windowLabel = data ? `${data.from} – ${data.to}` : '';

  return (
    <ReportFrame
      title="Attendance"
      definition="Check-ins over the last 8 weeks, by weekday and hour. Use peak arrival times to coordinate coach shifts. Empty hours stay in the grid."
      windowLabel={windowLabel}
      loading={loading}
      error={error}
    >
      {data && data.totalCheckIns === 0 && (
        <EmptyState message="No check-ins in this window" sub={`${data.from} to ${data.to}`} />
      )}
      {data && data.totalCheckIns > 0 && (
        <>
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>
            {data.totalCheckIns} check-ins
          </p>
          <p className="sm:hidden" style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><MoveHorizontal size={12} aria-hidden /> Swipe horizontally to view all 24 hours</p>
          <div className="table-responsive-container">
          <Card style={{ overflowX: 'auto', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(24, minmax(36px, 1fr))', gap: 3, minWidth: 920 }}>
              <div />
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{ fontSize: 9, color: 'var(--t4)', textAlign: 'center', lineHeight: 1.2 }}>
                  {hourLabel(hour)}
                </div>
              ))}
              {WEEKDAYS.map((label, dow) => (
                <div key={label} style={{ display: 'contents' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', alignSelf: 'center' }}>{label}</div>
                  {data.grid.filter((cell) => cell.dow === dow).map((cell) => (
                    <div
                      key={`${cell.dow}-${cell.hour}`}
                      title={`${label} ${hourLabel(cell.hour)} · ${cell.count}`}
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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>Daily totals</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 88, overflowX: 'auto' }}>
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
