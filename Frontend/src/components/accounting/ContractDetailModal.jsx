import { Link } from 'react-router-dom';
import { Modal, Btn, Badge, CAIRO_ZONE } from '../ui';
import SalesManagerSection from './SalesManagerSection';
import PackageTermsGrid from './PackageTermsGrid';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

function DetailRow({ label, value }) {
  return (
    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{value ?? '—'}</div>
    </div>
  );
}

export default function ContractDetailModal({ contract, open, onClose }) {
  const { t } = useI18n();
  const { fmtDateTime } = useFormat();
  if (!open || !contract) return null;

  const memberId = contract.member?.systemId ?? contract.member?._id;
  const isDirect = contract.source === 'direct_assignment';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Contract #{id}', { id: contract.subscriptionId ?? '—' })}
      size="lg"
      footer={<Btn variant="ghost" size="sm" onClick={onClose}>{t('Close')}</Btn>}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Badge status={isDirect ? 'active' : 'accepted'} />
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--t3)',
          background: 'var(--bg)', border: '1px solid var(--border)',
          padding: '2px 8px', borderRadius: 4,
        }}>
          {isDirect ? t('Direct Assignment') : t('Approved Request')}
        </span>
        {contract.isRenewal && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--amber)',
            background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {t('Renewal')}
          </span>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden', marginBottom: 16,
      }}>
        <DetailRow label={t('Member')} value={
          memberId
            ? <Link to={`/members/${memberId}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}><bdi>{contract.member?.name ?? '—'}</bdi></Link>
            : (contract.member?.name ?? '—')
        } />
        <DetailRow label={t('Contract #')} value={contract.subscriptionId ?? '—'} />
        <DetailRow label={t('Price Paid')} value={contract.pricePaid != null ? contract.pricePaid : '—'} />
        <DetailRow label={t('Refund')} value={Number(contract.refundAmount) > 0 ? contract.refundAmount : '—'} />
        <DetailRow label={t('Net')} value={contract.netPaid ?? contract.pricePaid ?? '—'} />
        <DetailRow label={t('Date Added')} value={contract.createdAt ? fmtDateTime(contract.createdAt, {
          timeZone: CAIRO_ZONE,
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }, 'en-US') : '—'} />
        <DetailRow label={t('Processed By')} value={contract.approvedBy?.name} />
      </div>

      <SalesManagerSection salesManager={contract.salesManager} directAssignment={isDirect} />

      <PackageTermsGrid data={contract} title={t('Package Terms')} showEndDate />
    </Modal>
  );
}
