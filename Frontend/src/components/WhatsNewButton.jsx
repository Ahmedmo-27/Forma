import { useState } from 'react';
import useWhatsNew from '../hooks/useWhatsNew';
import { useI18n } from '../i18n/useI18n';
import WhatsNewModal from './WhatsNewModal';
import WhatsNewDrawer from './WhatsNewDrawer';

/**
 * Top-bar What's New control + auto modal + history drawer.
 */
export default function WhatsNewButton() {
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    items,
    unread,
    unreadCount,
    dismiss,
    dismissAll,
    isDismissing,
    isLoading,
  } = useWhatsNew();

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={unreadCount ? t("What's new, {count} unread", { count: unreadCount }) : t("What's new")}
        title={t("What's new")}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 8,
          width: 40,
          height: 40,
          cursor: 'pointer',
          color: '#fff',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.13)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              insetInlineEnd: 4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--red, #ef4444)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <WhatsNewModal
        unread={unread}
        onDismissAll={dismissAll}
        dismissing={isDismissing}
      />

      <WhatsNewDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        onDismiss={dismiss}
        onDismissAll={dismissAll}
        dismissing={isDismissing}
        loading={isLoading}
      />
    </>
  );
}
