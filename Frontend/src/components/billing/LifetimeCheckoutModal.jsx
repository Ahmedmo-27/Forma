import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getBillingPrices, checkoutLifetimeBilling, confirmLifetimeBilling } from '../../api/endpoints';
import { Btn, Spinner, MenuSelect } from '../ui';
import { Check, X } from 'lucide-react';

export default function LifetimeCheckoutModal({ isOpen, onClose, defaultPlanKey = 'gold', onSuccess }) {
  const [plans, setPlans] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(true);

  const [selectedPlanKey, setSelectedPlanKey] = useState(defaultPlanKey);
  const [paymentMethod, setPaymentMethod] = useState('manual_transfer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setCheckoutSession(null);
      setTermsAccepted(false);
      setLoadingPrices(true);
      getBillingPrices()
        .then((res) => {
          setPlans(res.data?.plans || []);
          setPrices(res.data?.prices || []);
        })
        .catch((err) => {
          toast.error(err.response?.data?.message || 'Failed to load live plan prices');
        })
        .finally(() => setLoadingPrices(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const lifetimePrices = prices.filter((p) => p.cycle === 'lifetime');
  const selectedPrice = lifetimePrices.find((p) => p.planKey === selectedPlanKey);

  const handleCheckout = async () => {
    if (!termsAccepted) {
      toast.error('You must accept the lifetime service terms before proceeding');
      return;
    }
    setSubmitting(true);
    try {
      const checkoutRes = await checkoutLifetimeBilling({
        planKey: selectedPlanKey,
        paymentMethod,
        termsAccepted: true,
        termsVersion: '2026.1',
      });

      const session = checkoutRes.data;
      setCheckoutSession(session);

      // Confirm immediately for manual transfer flow
      const confirmRes = await confirmLifetimeBilling({
        paymentRef: session.paymentRef,
        planKey: selectedPlanKey,
        paymentMethod,
        termsVersion: '2026.1',
      });

      toast.success(confirmRes.data?.message || 'Lifetime license activated successfully!');
      if (onSuccess) onSuccess();
    } catch (err) {
      if (err.normalized?.status !== 402 && err.normalized?.status !== 403 && err.normalized?.status !== 409 && err.normalized?.status !== 429 && err.normalized?.status !== 500) {
        toast.error(err.normalized?.message || err.response?.data?.message || 'Checkout failed');
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
          maxWidth: 620,
          width: '100%',
          padding: 28,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--navy)' }}>
              Lifetime License Purchase
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
              One-time payment. Perpetual access for the lifetime of the SaaS platform.
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9CA3AF',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
          >
            <X size={22} aria-hidden />
          </button>
        </div>

        {loadingPrices ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spinner size="lg" />
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 12 }}>Loading available pricing...</p>
          </div>
        ) : checkoutSession ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: '#065F46', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={18} aria-hidden /> Lifetime License Activated!
              </div>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 6 }}>
                Payment Ref: <code style={{ fontWeight: 700 }}>{checkoutSession.paymentRef}</code>
              </div>
            </div>
            {checkoutSession.sessionDetails?.instructions && (
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#111827' }}>Bank Transfer Instructions:</div>
                <div>Bank: {checkoutSession.sessionDetails.instructions.bankName}</div>
                <div>Account: {checkoutSession.sessionDetails.instructions.accountName}</div>
                <div>IBAN: <code>{checkoutSession.sessionDetails.instructions.iban}</code></div>
                <div>Reference Code: <strong>{checkoutSession.sessionDetails.instructions.referenceCode}</strong></div>
              </div>
            )}
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Btn variant="primary" onClick={onClose}>Done</Btn>
            </div>
          </div>
        ) : (
          <div>
            {/* Tier Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {['basic', 'gold', 'platinum'].map((key) => {
                const price = lifetimePrices.find((p) => p.planKey === key);
                const isSelected = selectedPlanKey === key;
                const isSoldOut = price?.isSoldOut;

                return (
                  <div
                    key={key}
                    onClick={() => !isSoldOut && setSelectedPlanKey(key)}
                    style={{
                      border: isSelected ? '2px solid var(--navy)' : '1px solid #E5E7EB',
                      borderRadius: 12,
                      padding: 14,
                      cursor: isSoldOut ? 'not-allowed' : 'pointer',
                      background: isSelected ? 'rgba(68, 41, 140, 0.04)' : isSoldOut ? '#F3F4F6' : '#FFFFFF',
                      opacity: isSoldOut ? 0.6 : 1,
                      position: 'relative',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize', color: '#111827' }}>
                      {key}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', margin: '6px 0' }}>
                      EGP {price?.amount ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>One-time</div>

                    {price?.remainingSeats != null && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          color: isSoldOut ? '#DC2626' : '#D97706',
                          background: isSoldOut ? '#FEE2E2' : '#FEF3C7',
                          padding: '2px 6px',
                          borderRadius: 4,
                          display: 'inline-block',
                        }}
                      >
                        {isSoldOut ? 'SOLD OUT' : `${price.remainingSeats} seats left`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Payment Method */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Payment Method
              </label>
              <MenuSelect
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: '100%' }}
                aria-label="Payment method"
              >
                <option value="manual_transfer">Bank Transfer / Cash Deposit (Manual Approval)</option>
                <option value="online">Online Credit / Debit Card (Instant)</option>
              </MenuSelect>
            </div>

            {/* Legal Terms Disclosure */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>
                Lifetime License Terms (v2026.1)
              </div>
              <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                Lifetime access refers exclusively to the duration of the Forma cloud product service.
                Access is non-transferable and subject to platform fair-use limits. Downgrades are not permitted.
                Refunds are governed by the 30-day evaluation policy.
              </p>
            </div>

            {/* Mandatory Checkbox */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                I have read and agree to the <strong>Forma Lifetime Service Terms (v2026.1)</strong> and understand this is a perpetual license for this gym tenant.
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Btn variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Btn>
              <Btn variant="primary" onClick={handleCheckout} disabled={submitting || !termsAccepted || selectedPrice?.isSoldOut}>
                {submitting ? <><Spinner size="sm" /> Activating...</> : `Confirm & Pay EGP ${selectedPrice?.amount || ''}`}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
