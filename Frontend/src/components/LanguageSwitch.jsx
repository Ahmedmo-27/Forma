import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n/translate';

const TONES = {
  menu: { text: 'var(--t2)', muted: 'var(--t4)', activeBg: 'var(--navy)', activeText: '#fff', border: 'var(--border)' },
  dark: { text: 'rgba(255,255,255,0.75)', muted: 'rgba(255,255,255,0.45)', activeBg: 'rgba(255,255,255,0.18)', activeText: '#fff', border: 'rgba(255,255,255,0.14)' },
  light: { text: '#374151', muted: '#9CA3AF', activeBg: '#142843', activeText: '#FCF3E2', border: '#E6DCC8' },
};

/** English / Arabic toggle. The choice is remembered on this device. */
export default function LanguageSwitch({ tone = 'menu', showLabel = true, style }) {
  const { lang, setLanguage, t } = useI18n();
  const colors = TONES[tone] || TONES.menu;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      {showLabel && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: colors.muted }}>
          <Languages size={13} aria-hidden="true" />
          {t('Language')}
        </span>
      )}
      <div role="group" aria-label={t('Language')} style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden', marginInlineStart: showLabel ? 'auto' : 0 }}>
        {LANGUAGES.map((code) => {
          const active = code === lang;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={active}
              onClick={() => setLanguage(code)}
              style={{
                padding: '4px 10px', fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
                border: 'none', cursor: active ? 'default' : 'pointer',
                background: active ? colors.activeBg : 'transparent',
                color: active ? colors.activeText : colors.text,
              }}
            >
              {LANGUAGE_LABELS[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
