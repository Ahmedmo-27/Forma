import { Link } from 'react-router-dom';
import { Modal, Btn, Badge, CAIRO_ZONE, Spinner } from '../ui';
import SalesManagerSection from './SalesManagerSection';
import PackageTermsGrid from './PackageTermsGrid';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

export default function PackageAcceptModal({ request, open, onClose, onConfirm, loading }) {
  const { t } = useI18n();
  const { fmtDateTime } = useFormat();
  if (!open || !request) return null;

  const memberId = request.member?.systemId ?? request.member?._id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={request.hasException ? t('Approve Package Exception') : t('Approve Package Request')}
      size="lg"
      footer={
        <>
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>{t('Cancel')}</Btn>
          <Btn variant="success" size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner size="sm" /> : t('Confirm & Add Package')}
          </Btn>
        </>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Badge status="pending" />
        {request.hasException && (
          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.4px', background: 'var(--amber-bg)', color: 'var(--amber)',
            border: '1px solid var(--amber-bd)', padding: '2px 7px', borderRadius: 4,
          }}>
            {t('Exception')}
          </span>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden', marginBottom: 16,
      }}>
        <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{t('Member')}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {memberId
              ? <Link to={`/members/${memberId}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}><bdi>{request.member?.name ?? '—'}</bdi></Link>
              : (request.member?.name ?? '—')}
          </div>
        </div>
        <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{t('Submitted')}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {request.createdAt ? fmtDateTime(request.createdAt, {
              timeZone: CAIRO_ZONE,
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            }, 'en-US') : '—'}
          </div>
        </div>
      </div>

      <SalesManagerSection salesManager={request.proposedBy} />

      <PackageTermsGrid
        data={request}
        title={request.hasException ? t('Proposed Terms (Exception)') : t('Package Terms')}
      />

      {request.reason && (
        <div style={{ fontSize: 12, color: 'var(--t2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginTop: 16 }}>
          <span style={{ fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>{t('Reason:')} </span>
          {request.reason}
        </div>
      )}
    </Modal>
  );
}
