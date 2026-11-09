import { fmtDate } from '../ui';
import { useTenant } from '../../context/TenantContext';

function DetailRow({ label, value }) {
  return (
    <div style={{ background: 'var(--card)', padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{value ?? '—'}</div>
    </div>
  );
}

function ExceptionFlag() {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.4px', background: 'var(--amber-bg)', color: 'var(--amber)',
      border: '1px solid var(--amber-bd)', padding: '2px 7px', borderRadius: 4,
    }}>
      Exception
    </span>
  );
}

/**
 * Renders package terms from either a pending PackageExceptionRequest or a contract/subscription record.
 */
export default function PackageTermsGrid({ data, title, showEndDate = false }) {
  const { currency = 'EGP' } = useTenant() || {};
  if (!data) return null;

  // Prefer purchase-time snapshot so catalog edits never rewrite payment history
  const snap = data.packageSnapshot;
  const hasException = data.hasException ?? snap?.hasException ?? data.package?.hasException;
  const pkg = snap ?? data.package ?? data;
  const name = data.name ?? pkg?.name;
  const activityType = data.activityType ?? pkg?.activityType;
  const duration = data.duration ?? pkg?.duration;
  const price = data.price ?? pkg?.price;
  const pricePaid = data.pricePaid;
  const discountPercent = data.discountPercent;
  const freezeLimitDays = data.freezeLimitDays ?? pkg?.freezeLimitDays;
  const invitationLimit = data.invitationLimit ?? pkg?.invitationLimit;
  const renewalDiscountPercent = data.renewalDiscountPercent ?? pkg?.renewalDiscountPercent;
  const startDate = data.startDate;
  const endDate = data.endDate;
  const basePackageName = data.basePackage?.name;

  return (
    <div>
      {title && (
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
          {title}
        </p>
      )}
      {hasException && (
        <div style={{ marginBottom: 8 }}>
          <ExceptionFlag />
        </div>
      )}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        <DetailRow label="Package Name" value={name} />
        {basePackageName && <DetailRow label="Based On" value={basePackageName} />}
        <DetailRow label="Activity" value={activityType} />
        <DetailRow label="Duration" value={duration} />
        <DetailRow label={`Price (${currency})`} value={price?.toLocaleString?.() ?? price} />
        <DetailRow label={`Price Paid (${currency})`} value={pricePaid?.toLocaleString?.() ?? pricePaid} />
        <DetailRow label="Discount %" value={discountPercent ? `${discountPercent}%` : '0%'} />
        <DetailRow label="Freeze Limit" value={`${freezeLimitDays ?? 0} days`} />
        <DetailRow label="Invitation Slots" value={invitationLimit ?? 0} />
        <DetailRow label="Renewal Discount" value={renewalDiscountPercent ? `${renewalDiscountPercent}%` : 'None'} />
        <DetailRow label="Start Date" value={startDate ? fmtDate(startDate) : 'Today'} />
        {showEndDate && endDate && <DetailRow label="End Date" value={fmtDate(endDate)} />}
        {data.isRenewal != null && (
          <DetailRow label="Type" value={data.isRenewal ? 'Renewal' : 'New subscription'} />
        )}
      </div>
      {(data.description ?? pkg?.description) && (
        <p style={{ fontSize: 12, color: 'var(--t2)', marginTop: 12 }}>
          <strong style={{ color: 'var(--t3)' }}>Description:</strong> {data.description ?? pkg?.description}
        </p>
      )}
    </div>
  );
}
