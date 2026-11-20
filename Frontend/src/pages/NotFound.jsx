import usePageTitle from '../hooks/usePageTitle';
import { useI18n } from '../i18n/useI18n';

export default function NotFound() {
  const { t } = useI18n();
  usePageTitle(t('Not Found'));
  return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', padding: '0 24px' }}>
        <p style={{ fontSize: 72, fontWeight: 800, color: 'var(--border-md)', letterSpacing: '-3px', lineHeight: 1, marginBottom: 16 }}>404</p>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>{t('Page not found')}</h1>
        <p style={{ fontSize: 13, color: 'var(--t3)' }}>{t("The page you're looking for doesn't exist or you don't have access.")}</p>
      </div>
    </div>
  );
}
