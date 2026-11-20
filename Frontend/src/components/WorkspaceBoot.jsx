import { useI18n } from '../i18n/useI18n';

/** Full-screen cover shown until the signed-in tenant palette is applied. */
export default function WorkspaceBoot() {
  const { t } = useI18n();
  return (
    <div className="workspace-boot" role="status" aria-busy="true" aria-live="polite">
      <span className="workspace-boot-mark" aria-hidden="true" />
      <p className="workspace-boot-label">{t('Loading workspace')}</p>
    </div>
  );
}
