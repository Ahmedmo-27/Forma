import { Link } from 'react-router-dom';
import { Avatar } from '../ui';
import { useI18n } from '../../i18n/useI18n';

export default function SalesManagerSection({ salesManager, directAssignment = false }) {
  const { t } = useI18n();
  if (directAssignment || !salesManager) {
    return (
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '14px 16px', marginBottom: 16,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
          {t('Requested by')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
          {t('Direct assignment — no sales request')}
        </p>
      </div>
    );
  }

  const profileId = salesManager._id;

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
        {t('Requested by')}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={salesManager.name} size="md" />
        <div style={{ flex: 1 }}>
          {profileId ? (
            <Link
              to={`/sales/team/${profileId}`}
              style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', textDecoration: 'none' }}
            >
              <bdi>{salesManager.name ?? '—'}</bdi>
            </Link>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}><bdi>{salesManager.name ?? '—'}</bdi></div>
          )}
          {salesManager.email && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{salesManager.email}</span>
            </div>
          )}
          {salesManager.role && (
            <span style={{
              display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.4px',
              background: 'var(--blue-bg, rgba(59,130,246,0.1))', color: 'var(--blue)',
              border: '1px solid var(--blue-bd, rgba(59,130,246,0.25))',
              padding: '2px 7px', borderRadius: 4,
            }}>
              {t(salesManager.role)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
