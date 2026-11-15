import { Link } from 'react-router-dom';
import { Modal, Btn, Badge, fmtDateTime } from '../ui';
import SalesManagerSection from './SalesManagerSection';
import PackageTermsGrid from './PackageTermsGrid';

function DetailRow({ label, value }) {
  return (
    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{value ?? '—'}</div>
    </div>
  );
}

export default function ContractDetailModal({ contract, open, onClose }) {
  if (!open || !contract) return null;

  const memberId = contract.member?.systemId ?? contract.member?._id;
  const isDirect = contract.source === 'direct_assignment';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Contract #${contract.subscriptionId ?? '—'}`}
      size="lg"
      footer={<Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Badge status={isDirect ? 'active' : 'accepted'} />
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--t3)',
          background: 'var(--bg)', border: '1px solid var(--border)',
          padding: '2px 8px', borderRadius: 4,
        }}>
          {isDirect ? 'Direct Assignment' : 'Approved Request'}
        </span>
        {contract.isRenewal && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--amber)',
            background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            Renewal
          </span>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden', marginBottom: 16,
      }}>
        <DetailRow label="Member" value={
          memberId
            ? <Link to={`/members/${memberId}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{contract.member?.name ?? '—'}</Link>
            : (contract.member?.name ?? '—')
        } />
        <DetailRow label="Contract #" value={contract.subscriptionId ?? '—'} />
        <DetailRow label="Price Paid" value={contract.pricePaid != null ? contract.pricePaid : '—'} />
        <DetailRow label="Refund" value={Number(contract.refundAmount) > 0 ? contract.refundAmount : '—'} />
        <DetailRow label="Net" value={contract.netPaid ?? contract.pricePaid ?? '—'} />
        <DetailRow label="Date Added" value={fmtDateTime(contract.createdAt)} />
        <DetailRow label="Processed By" value={contract.approvedBy?.name} />
      </div>

      <SalesManagerSection salesManager={contract.salesManager} directAssignment={isDirect} />

      <PackageTermsGrid data={contract} title="Package Terms" showEndDate />
    </Modal>
  );
}
