import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from './Layout';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/useI18n';
import { featureAllowed, featureKeys } from '../lib/canSeeRoute';
import {
  canRequestFeatureTrials,
  formatTrialEndsAt,
  lockedCatalogEntry,
} from '../lib/featureTrials';
import {
  cancelFeatureTrialRequest,
  createFeatureTrialRequest,
  getMyFeatureTrials,
} from '../api/endpoints';

/**
 * Renders children when the gym has the feature (or any of a list).
 * Otherwise shows a locked-module page with plan upsell + trial request.
 * Children never mount while the plan is unknown or the feature is off,
 * so gated APIs cannot fire Upgrade Required modals on navigation.
 */
export default function FeatureGate({ feature, fallback, children }) {
  const { plan, tenant, loading, hasFeature, refreshTenant, lockedFeatureCatalog, activeFeatureTrials } = useTenant();
  const { user } = useAuth();
  const { t } = useI18n();
  const keys = featureKeys(feature);
  const featureLabel = keys.join(', ');
  const primaryKey = keys[0] || '';

  const canRequest = canRequestFeatureTrials(user);
  const catalogRow = useMemo(
    () => lockedCatalogEntry(lockedFeatureCatalog, primaryKey),
    [lockedFeatureCatalog, primaryKey]
  );
  const activeTrial = useMemo(
    () => (activeFeatureTrials || []).find((row) => keys.includes(row.featureKey)),
    [activeFeatureTrials, keys]
  );

  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [durationValue, setDurationValue] = useState(14);
  const [durationUnit, setDurationUnit] = useState('days');

  const pendingRequest = useMemo(
    () => requests.find((r) => r.status === 'pending' && keys.includes(r.featureKey)),
    [requests, keys]
  );

  useEffect(() => {
    if (!canRequest || featureAllowed(hasFeature, feature) || loading || !tenant) return undefined;
    let cancelled = false;
    setLoadingRequests(true);
    getMyFeatureTrials()
      .then((res) => {
        if (cancelled) return;
        setRequests(Array.isArray(res.data?.requests) ? res.data.requests : []);
      })
      .catch(() => {
        if (!cancelled) setRequests([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRequests(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRequest, feature, hasFeature, loading, tenant, primaryKey]);

  if (loading) {
    return (
      <Layout>
        <div style={{ margin: '48px 0', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
          {t('Loading…')}
        </div>
      </Layout>
    );
  }

  if (!tenant) {
    if (fallback !== undefined) return fallback;
    return (
      <Layout>
        <div style={{ margin: '24px 0', padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>
            {t('We could not load your gym’s plan. Check your connection and try again.')}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => refreshTenant?.()}>
            {t('Try again')}
          </button>
        </div>
      </Layout>
    );
  }

  if (featureAllowed(hasFeature, feature)) {
    return children;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  const planName = catalogRow?.availableOnPlan?.name;
  const displayName = catalogRow?.name || featureLabel;

  async function submitRequest(e) {
    e.preventDefault();
    if (!primaryKey || submitting) return;
    setSubmitting(true);
    try {
      const res = await createFeatureTrialRequest({
        featureKey: primaryKey,
        durationValue: Number(durationValue),
        durationUnit,
      });
      const created = res.data?.request;
      if (created) setRequests((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      toast.success(t('Trial request submitted'));
    } catch (err) {
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.message
        || (code === 'PENDING_REQUEST_EXISTS'
          ? t('A pending request already exists for this feature.')
          : t('Could not submit trial request'));
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelPending() {
    if (!pendingRequest?.id || submitting) return;
    setSubmitting(true);
    try {
      const res = await cancelFeatureTrialRequest(pendingRequest.id);
      const updated = res.data?.request;
      if (updated) {
        setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      toast.success(t('Trial request cancelled'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('Could not cancel request'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div
        style={{
          margin: '24px auto',
          maxWidth: 560,
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
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 22,
            fontWeight: 700,
          }}
          aria-hidden
        >
          {/* i18n-ignore */}
          i
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
          {t('Outside current plan')}
        </h3>
        <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 480, margin: '0 auto 12px', lineHeight: 1.5 }}>
          {t('“{feature}” is not included in your gym’s plan.', { feature: displayName })}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: '#F3F4F6', fontSize: 12, fontWeight: 600, color: '#4B5563' }}>
            {t('Current Tier:')} <span style={{ color: 'var(--navy)' }}>{plan?.name || t('Standard')}</span>
          </div>
          {planName ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: 'rgba(37, 99, 235, 0.08)', fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>
              {t('Available on')} {planName}
            </div>
          ) : null}
          {activeTrial?.endsAt ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: '#FEF3C7', fontSize: 12, fontWeight: 600, color: '#92400E' }}>
              {t('Previous trial ended')} {formatTrialEndsAt(activeTrial.endsAt)}
            </div>
          ) : null}
        </div>

        {!canRequest ? (
          <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
            {t('Ask your gym owner to request a trial for this module.')}
          </p>
        ) : pendingRequest ? (
          <div style={{ textAlign: 'left', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 14, color: '#111827', fontWeight: 600, marginBottom: 6 }}>
              {t('Trial request pending')}
            </p>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 14, lineHeight: 1.45 }}>
              {t('Requested {value} {unit}. Platform admin will review shortly.', {
                value: pendingRequest.requestedDurationValue,
                unit: pendingRequest.requestedDurationUnit,
              })}
            </p>
            <button
              type="button"
              className="btn"
              disabled={submitting}
              onClick={cancelPending}
            >
              {t('Cancel request')}
            </button>
          </div>
        ) : (
          <form onSubmit={submitRequest} style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12, lineHeight: 1.45 }}>
              {t('Request a timed trial. Your platform admin can accept or change the period.')}
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <label style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#374151' }}>
                {t('Duration')}
                <input
                  type="number"
                  min={1}
                  max={durationUnit === 'weeks' ? 12 : 90}
                  value={durationValue}
                  onChange={(e) => setDurationValue(e.target.value)}
                  required
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ width: 140, fontSize: 12, fontWeight: 600, color: '#374151' }}>
                {t('Unit')}
                <select
                  value={durationUnit}
                  onChange={(e) => {
                    setDurationUnit(e.target.value);
                    setDurationValue((prev) => {
                      const n = Number(prev) || 1;
                      if (e.target.value === 'weeks' && n > 12) return 2;
                      if (e.target.value === 'days' && n > 90) return 14;
                      return prev;
                    });
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    fontSize: 14,
                    background: '#fff',
                  }}
                >
                  <option value="days">{t('Days')}</option>
                  <option value="weeks">{t('Weeks')}</option>
                </select>
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting || loadingRequests}>
              {submitting ? t('Submitting…') : t('Request trial')}
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
}
