import { HelpCircle } from 'lucide-react';
import { useWalkthrough } from '../../tutorials/walkthrough-context';
import { useI18n } from '../../i18n/useI18n';

export default function HelpButton() {
  const { openHelpModal } = useWalkthrough();
  const { t } = useI18n();

  return (
    <button
      type="button"
      data-walkthrough="help-btn"
      aria-label={t('Tutorials and guides')}
      title={t('Tutorials and guides')}
      onClick={() => openHelpModal()}
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 8,
        width: 40,
        height: 40,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0,
      }}
    >
      <HelpCircle size={18} strokeWidth={2.2} />
    </button>
  );
}
