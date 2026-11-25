import { useEffect, useState } from 'react';
import { Modal, Btn, Spinner } from './ui';
import { useI18n } from '../i18n/useI18n';

/**
 * Cross-tenant staff conflict: ask whether they work at both gyms or moved here,
 * then confirm that Forma's support team received the request.
 */
export default function StaffIdentityRequestModal({
  open,
  onClose,
  loading = false,
  existing,
  requestingGymName,
  onSubmit,
}) {
  const { t } = useI18n();
  const [choice, setChoice] = useState('dual');
  const [step, setStep] = useState('choose'); // choose | sent

  useEffect(() => {
    if (!open) {
      setChoice('dual');
      setStep('choose');
    }
  }, [open]);

  const staffName = existing?.name || t('This staff member');
  const sourceGym = existing?.tenantName || t('another gym');
  const thisGym = requestingGymName || t('this gym');

  const handleSubmit = async () => {
    if (!onSubmit || loading) return;
    const ok = await onSubmit(choice);
    if (ok !== false) setStep('sent');
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (loading) return;
        onClose?.();
      }}
      title={
        step === 'sent'
          ? t('Request sent')
          : t('Staff member already registered')
      }
      size="sm"
      footer={
        step === 'sent' ? (
          <Btn variant="primary" size="sm" onClick={onClose}>
            {t('Got it')}
          </Btn>
        ) : (
          <>
            <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              {t('Cancel')}
            </Btn>
            <Btn variant="primary" size="sm" onClick={handleSubmit} disabled={loading}>
              {loading ? <Spinner size="sm" /> : t('Send request')}
            </Btn>
          </>
        )
      }
    >
      {step === 'sent' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, margin: 0 }}>
            {t(
              "A request has been sent to Forma's support team. They'll review it and you'll get a response soon."
            )}
          </p>
          <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5, margin: 0 }}>
            {t('You will also receive an in-app notification when Forma responds.')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, margin: 0 }}>
            {t(
              '{name} is already registered as staff at {gym}. How should we treat them at {thisGym}?',
              { name: staffName, gym: sourceGym, thisGym }
            )}
          </p>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '12px 12px',
              borderRadius: 10,
              border: `1.5px solid ${choice === 'dual' ? 'var(--navy)' : 'var(--border, #E6DCC8)'}`,
              background: choice === 'dual' ? 'color-mix(in srgb, var(--navy) 6%, transparent)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="staff-identity-choice"
              checked={choice === 'dual'}
              onChange={() => setChoice('dual')}
              style={{ marginTop: 3 }}
            />
            <span>
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--t1)' }}>
                {t('Working at both places')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, lineHeight: 1.45 }}>
                {t(
                  'Keep them at {gym} and also add them here. They will choose a gym when signing in.',
                  { gym: sourceGym }
                )}
              </div>
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '12px 12px',
              borderRadius: 10,
              border: `1.5px solid ${choice === 'transfer' ? 'var(--navy)' : 'var(--border, #E6DCC8)'}`,
              background: choice === 'transfer' ? 'color-mix(in srgb, var(--navy) 6%, transparent)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="staff-identity-choice"
              checked={choice === 'transfer'}
              onChange={() => setChoice('transfer')}
              style={{ marginTop: 3 }}
            />
            <span>
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--t1)' }}>
                {t('Left {gym} and works at {thisGym} now', { gym: sourceGym, thisGym })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, lineHeight: 1.45 }}>
                {t(
                  'Move their login (name, phone, email, password) here and remove access at {gym}.',
                  { gym: sourceGym }
                )}
              </div>
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
