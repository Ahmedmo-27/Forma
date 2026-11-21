import { Avatar, Badge, EmptyState, Spinner } from './ui';
import { formatSystemId } from '../lib/systemId';
import {
  OPTIONAL_VISIT_COLUMNS,
  optionalColumnValue,
} from '../lib/memberDetailColumns';
import { useI18n } from '../i18n/useI18n';
import { CheckCircle2 } from 'lucide-react';

/**
 * Visit rows table for Check In / Attendance.
 * Optional member columns render only when `canCustomize` and selected in `visibleKeys`.
 */
export default function MemberVisitsTable({
  entries = [],
  loading = false,
  emptyMessage,
  emptySub,
  onRowClick,
  fmtTime,
  canCustomize = false,
  visibleKeys = [],
  /** When true, serial counts down from entries.length (newest-first boards). */
  serialFromTotal = null,
  freshIds,
}) {
  const { t } = useI18n();
  const activeOptional = canCustomize
    ? OPTIONAL_VISIT_COLUMNS.filter((col) => visibleKeys.includes(col.key))
    : [];

  const headers = [
    t('#'),
    t('Name'),
    ...activeOptional.map((col) => t(col.label)),
    t('Time'),
    t('Status'),
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    );
  }

  if (!entries.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        message={emptyMessage || t('No check-ins in this period')}
        sub={emptySub}
      />
    );
  }

  return (
    <div className="table-responsive-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  padding: '10px 14px',
                  textAlign: 'start',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  color: 'var(--t4)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const serial = serialFromTotal != null
              ? serialFromTotal - i
              : i + 1;
            const isFresh = freshIds?.has?.(String(entry._id));
            const member = entry.member || {};
            return (
              <tr
                key={entry._id ?? `${member.systemId}-${entry.time}-${i}`}
                onClick={() => onRowClick?.(entry)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  borderBottom: '1px solid var(--border)',
                  background: isFresh ? 'rgba(34,197,94,0.10)' : 'transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isFresh ? 'rgba(34,197,94,0.10)' : 'transparent';
                }}
              >
                <td style={{ padding: '10px 14px', color: 'var(--t4)', fontWeight: 700, width: 44 }}>
                  {serial}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar name={member.name} size="sm" photo={member.photo} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--t1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {member.name || '—'}
                      </div>
                      {entry.checkedInBy?.name && (
                        <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>
                          {t('by {name}', { name: entry.checkedInBy.name })}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {activeOptional.map((col) => {
                  const value = optionalColumnValue(entry, col.key);
                  const isLtr = col.key === 'phone' || col.key === 'systemId' || col.key === 'memberId';
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '10px 14px',
                        color: 'var(--t2)',
                        whiteSpace: 'nowrap',
                        fontFamily: col.key === 'systemId' ? 'monospace' : undefined,
                      }}
                      dir={isLtr ? 'ltr' : undefined}
                    >
                      {col.key === 'systemId' && value !== '—'
                        ? formatSystemId(value)
                        : value}
                    </td>
                  );
                })}
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--t1)' }}>
                  {fmtTime ? fmtTime(entry.time) : '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <Badge status={member.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
