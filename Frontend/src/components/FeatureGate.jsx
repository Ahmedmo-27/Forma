import { useFeature } from '../hooks/useFeature';
import { useTenant } from '../context/TenantContext';

export default function FeatureGate({ feature, fallback, children }) {
  const isEnabled = useFeature(feature);
  const { plan } = useTenant();

  if (isEnabled) {
    return children;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  return (
    <div
      style={{
        margin: '24px 0',
        padding: '32px 24px',
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E5E7EB',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(68, 41, 140, 0.08)',
          color: 'var(--navy)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        Feature Not Available in {plan?.name || 'Current'} Plan
      </h3>
      <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.5 }}>
        This module (<code>{feature}</code>) is part of a higher tier subscription. Contact your platform administrator to upgrade your gym’s plan and unlock this capability.
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: '#F3F4F6', fontSize: 12, fontWeight: 600, color: '#4B5563' }}>
        Current Tier: <span style={{ color: 'var(--navy)' }}>{plan?.name || 'Standard'}</span>
      </div>
    </div>
  );
}
