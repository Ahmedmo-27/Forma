import { Card, CardHeader, Table, EmptyState, Avatar, Badge, InfoRow } from '../../../components/ui';
import { useI18n } from '../../../i18n/useI18n';
import { useMemberDates } from '../useMemberDates';

export default function OthersTab({ profileViews = [], member, user }) {
  const { t } = useI18n();
  const { fmtDateTime } = useMemberDates();
  const isCoachRole = ['Coach', 'Head Coach'].includes(user?.role);
  const coachRoles = ['Coach', 'Head Coach'];

  // Filter views: coaches see only coach views, others see only non-coach views
  const filteredViews = profileViews.filter(v => {
    const viewerRole = v.viewedBy?.role;
    if (isCoachRole) return coachRoles.includes(viewerRole);
    return !coachRoles.includes(viewerRole);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Coach-specific: PT Session info */}
      {isCoachRole && member && (
        <Card>
          <CardHeader title={t('PT Sessions')} />
          <InfoRow label={t('Assigned Coach')} value={member.current_couch?.name || '—'} />
          <InfoRow label={t('PT Status')} value={<Badge status={member.couch_subscription_status || 'guest'} />} />
          <InfoRow label={t('Total Sessions')} value={member.PT_sessions || 0} />
          <InfoRow label={t('Used Sessions')} value={member.used_PT_sessions || 0} />
          <InfoRow label={t('Remaining')} value={(member.PT_sessions || 0) - (member.used_PT_sessions || 0)} />
        </Card>
      )}

      {/* Profile views — filtered by role type */}
      <Card noPad>
        <div style={{ padding: '14px 18px 0' }}>
          <CardHeader title={t('Profile Views ({count})', { count: filteredViews.length })} />
        </div>

        {!filteredViews.length ? (
          <EmptyState message={t('No profile views recorded yet')} />
        ) : (
          <Table headers={['#', t('User'), t('Role'), t('Date & Time')]}>
            {filteredViews.map((v, i) => (
              <tr key={v._id ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t4)', fontFamily: 'monospace', width: 48 }}>{i + 1}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={v.viewedBy?.name ?? '?'} size="sm" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}><bdi>{v.viewedBy?.name ?? '—'}</bdi></span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4 }}>
                    {v.viewedBy?.role ? t(v.viewedBy.role) : '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{fmtDateTime(v.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
