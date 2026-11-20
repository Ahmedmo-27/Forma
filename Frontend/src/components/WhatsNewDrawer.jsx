import { Btn } from './ui';
import { useI18n } from '../i18n/useI18n';
import { useFormat } from '../i18n/useFormat';
import { tr } from '../i18n/translate';

const TYPE_LABEL = {
  feature: tr('Feature'),
  warning: tr('Warning'),
  maintenance: tr('Maintenance'),
  info: tr('Info'),
};

function formatWhen(value, fmtDate) {
  if (!value) return '';
  try {
    return fmtDate(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Slide-over history panel for What's New (active + recently dismissed).
 */
export default function WhatsNewDrawer({
  open,
  onClose,
  items = [],
  onDismiss,
  onDismissAll,
  dismissing = false,
  loading = false,
}) {
  const { t, isRtl } = useI18n();
  const { fmtDate } = useFormat();
  if (!open) return null;

  const unread = items.filter((item) => !item.dismissed);

  return (
    <>
      <div
        onClick={onClose}
        className="modal-backdrop-in"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 190,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("What's new")}
        className="drawer-in-right"
        style={{
          position: 'fixed',
          top: 0,
          insetInlineEnd: 0,
          bottom: 0,
          zIndex: 191,
          width: 'min(420px, 100vw)',
          background: 'var(--card)',
          borderInlineStart: '1px solid var(--border)',
          boxShadow: isRtl ? '8px 0 24px rgba(0,0,0,0.12)' : '-8px 0 24px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{t("What's new")}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
              {t('Updates for your role and plan')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              width: 32,
              height: 32,
              cursor: 'pointer',
              color: 'var(--t3)',
            }}
          >
            ×
          </button>
        </div>

        {unread.length > 0 && (
          <div
            style={{
              padding: '10px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Btn
              variant="ghost"
              size="sm"
              disabled={dismissing}
              onClick={() => onDismissAll?.()}
            >
              {t('Mark all as read')}
            </Btn>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading && (
            <div style={{ fontSize: 13, color: 'var(--t3)', padding: 12 }}>{t('Loading updates…')}</div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--t3)', padding: 12, textAlign: 'center' }}>
              {t('No updates right now. Check back after the next platform release.')}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item._id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: item.dismissed ? 'var(--card)' : 'var(--bg)',
                  opacity: item.dismissed ? 0.72 : 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: 'var(--t3)',
                    }}
                  >
                    {t(TYPE_LABEL[item.type] || 'Update')}
                    {' · '}{item.dismissed ? t('Read') : t('New')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                    {formatWhen(item.startDate || item.createdAt, fmtDate)}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--t2)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {item.message}
                </div>
                {!item.dismissed && (
                  <div style={{ marginTop: 10 }}>
                    <Btn
                      variant="ghost"
                      size="sm"
                      disabled={dismissing}
                      onClick={() => onDismiss?.(item._id)}
                    >
                      {t('Got it')}
                    </Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
