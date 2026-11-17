import { useEffect, useRef, useState } from 'react';
import { Modal, Btn } from './ui';

const TYPE_LABEL = {
  feature: 'New feature',
  warning: 'Warning',
  maintenance: 'Maintenance',
  info: 'Update',
};

const TYPE_COLOR = {
  feature: 'var(--green, #16a34a)',
  warning: 'var(--amber, #d97706)',
  maintenance: 'var(--amber, #d97706)',
  info: 'var(--navy, #1e3a5f)',
};

/**
 * Auto-opens once per browser session when there are unread announcements.
 */
export default function WhatsNewModal({ unread = [], onDismissAll, dismissing = false }) {
  const [open, setOpen] = useState(false);
  const shownSessionRef = useRef(false);

  useEffect(() => {
    if (shownSessionRef.current) return;
    if (!unread.length) return;
    shownSessionRef.current = true;
    setOpen(true);
  }, [unread.length]);

  if (!unread.length && !open) return null;

  const handleGotIt = async () => {
    try {
      await onDismissAll?.();
    } finally {
      setOpen(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="What's new"
      size="md"
      footer={
        <>
          <Btn variant="ghost" onClick={() => setOpen(false)}>
            Later
          </Btn>
          <Btn variant="primary" onClick={handleGotIt} disabled={dismissing}>
            Got it
          </Btn>
        </>
      }
    >
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--t2)', lineHeight: 1.45 }}>
        Here are recent platform updates for your role and plan.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {unread.map((item) => (
          <div
            key={item._id}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: TYPE_COLOR[item.type] || TYPE_COLOR.info,
                marginBottom: 4,
              }}
            >
              {TYPE_LABEL[item.type] || 'Update'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {item.message}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
