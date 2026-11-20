
import { ErrorModal } from "./ErrorModal";
import { useI18n } from "../../i18n/useI18n";

export function ConflictModal({ isOpen, onClose, onReload }) {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("Conflicting Edits Detected")}
      message={t("Another user or process updated this record while you were editing. To avoid overwriting changes, please reload the latest version.")}
      severity="warning"
      primaryAction={{
        label: t("Reload Latest Changes"),
        onClick: () => {
          onClose();
          onReload ? onReload() : window.location.reload();
        },
      }}
      secondaryAction={{
        label: t("Keep Editing"),
        onClick: onClose,
      }}
    />
  );
}
