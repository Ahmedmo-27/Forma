import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getBillingPrices, upgradeLifetimeBilling } from '../../api/endpoints';
import { Btn, Spinner } from '../ui';

const TIER_RANKS = {
  basic: 1,
  gold: 2,
  platinum: 3,
};

export default function LifetimeUpgradeModal({ isOpen, onClose, currentPlanKey, currentAmountPaid = 0, onSuccess }) {
  const [prices, setPrices] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [selectedTargetKey, setSelectedTargetKey] = useState(currentPlanKey === 'basic' ? 'gold' : 'platinum');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTermsAccepted(false);
      setLoadingPrices(true);
      getBillingPrices()
        .then((res) => {
          setPrices(res.data?.prices || []);
        })
        .catch((err) => {
          toast.error(err.response?.data?.message || 'Failed to load pricing');
        })
        .finally(() => setLoadingPrices(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentRank = TIER_RANKS[currentPlanKey] || 1;
  const lifetimePrices = prices.filter((p) => p.cycle === 'lifetime');
  const targetPriceObj = lifetimePrices.find((p) => p.planKey === selectedTargetKey);

  const targetAmount = targetPriceObj?.amount || 0;
  const upgradeDifference = Math.max(0, targetAmount - currentAmountPaid);

  const handleUpgrade = async () => {
    if (!termsAccepted) {
      toast.error('You must accept the lifetime service terms before upgrading');
      return;
    }
    setSubmitting(true);
    try {
      const res = await upgradeLifetimeBilling({
        targetPlanKey: selectedTargetKey,
        paymentMethod: 'manual_transfer',
        termsAccepted: true,
        termsVersion: '2026.1',
      });

      toast.success(res.data?.message || 'Lifetime tier upgraded successfully!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      if (err.normalized?.status !== 402 && err.normalized?.status !== 403 && err.normalized?.status !== 409 && err.normalized?.status !== 429 && err.normalized?.status !== 500) {
        toast.error(err.normalized?.message || err.response?.data?.message || 'Upgrade failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          maxWidth: 580,
          width: '100%',
          padding: 28,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--navy)' }}>
              Upgrade Lifetime Tier
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
              Pay only the difference between your previous payment and the new tier price.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#9CA3AF',
            }}
          >
            ×
          </button>
        </div>

        {loadingPrices ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spinner size="lg" />
          </div>
        ) : (
          <div>
            {/* Target Tier Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              {['gold', 'platinum'].map((key) => {
                const rank = TIER_RANKS[key];
                const isLowerOrEqual = rank <= currentRank;
                const price = lifetimePrices.find((p) => p.planKey === key);
                const isSelected = selectedTargetKey === key;
                const isSoldOut = price?.isSoldOut;

                return (
                  <div
                    key={key}
                    onClick={() => !isLowerOrEqual && !isSoldOut && setSelectedTargetKey(key)}
                    style={{
                      border: isSelected ? '2px solid var(--navy)' : '1px solid #E5E7EB',
                      borderRadius: 12,
                      padding: 14,
                      cursor: isLowerOrEqual || isSoldOut ? 'not-allowed' : 'pointer',
                      background: isSelected ? 'rgba(68, 41, 140, 0.04)' : isLowerOrEqual || isSoldOut ? '#F3F4F6' : '#FFFFFF',
                      opacity: isLowerOrEqual || isSoldOut ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>{key} Plan</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', margin: '4px 0' }}>
                      EGP {price?.amount ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>
                      {isLowerOrEqual ? 'Current or Lower Tier' : isSoldOut ? 'Sold Out' : 'Available for Upgrade'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Price Math Breakdown */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#64748B' }}>Target Tier Full Price:</span>
                <span style={{ fontWeight: 600 }}>EGP {targetAmount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#64748B' }}>Amount Credited (Previously Paid):</span>
                <span style={{ fontWeight: 600, color: '#16A34A' }}>-EGP {currentAmountPaid}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 16,
                  fontWeight: 800,
                  borderTop: '1px solid #CBD5E1',
                  paddingTop: 8,
                  marginTop: 8,
                  color: 'var(--navy)',
                }}
              >
                <span>Amount Due Today:</span>
                <span>EGP {upgradeDifference}</span>
              </div>
            </div>

            {/* Mandatory Checkbox */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: '#374151' }}>
                I agree to upgrade to <strong>{selectedTargetKey?.toUpperCase()} Lifetime</strong> and accept the Leap Gym Lifetime Service Terms (v2026.1).
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Btn variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Btn>
              <Btn variant="primary" onClick={handleUpgrade} disabled={submitting || !termsAccepted || upgradeDifference <= 0}>
                {submitting ? <><Spinner size="sm" /> Upgrading...</> : `Pay Difference (EGP ${upgradeDifference})`}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
