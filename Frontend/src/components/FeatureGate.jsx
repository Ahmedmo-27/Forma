import { useTenant } from '../context/TenantContext';
import { useI18n } from '../i18n/useI18n';
import { featureAllowed, featureKeys } from '../lib/canSeeRoute';

/**
 * Renders children when the gym has the feature (or any of a list).
 * Otherwise shows a locked-module page so a removed page explains itself.
 */
export default function FeatureGate({ feature, fallback, children }) {
  const { plan, tenant, loading, hasFeature, refreshTenant } = useTenant();
  const { t } = useI18n();
  const isEnabled = featureAllowed(hasFeature, feature);
  const featureLabel = featureKeys(feature).join(', ');

  if (isEnabled) {
    return children;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  // Plan details never arrived (network error): say so instead of claiming the module is locked.
  if (!tenant && !loading) {
    return (
      <div style={{ margin: '24px 0', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>
          {t('We could not load your gym’s plan. Check your connection and try again.')}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => refreshTenant?.()}>
          {t('Try again')}
        </button>
      </div>
    );
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
        {t('Module Not Available in {plan} Plan', { plan: plan?.name || t('Current') })}
      </h3>
      <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.5 }}>
        {t('This module ({feature}) is not enabled for your gym. Contact your platform administrator to add it to your plan.', { feature: featureLabel })}
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: '#F3F4F6', fontSize: 12, fontWeight: 600, color: '#4B5563' }}>
        {t('Current Tier:')} <span style={{ color: 'var(--navy)' }}>{plan?.name || t('Standard')}</span>
      </div>
    </div>
  );
}
