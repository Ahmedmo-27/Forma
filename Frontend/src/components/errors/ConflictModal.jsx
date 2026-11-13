
import { ErrorModal } from "./ErrorModal";

export function ConflictModal({ isOpen, onClose, onReload }) {
  if (!isOpen) return null;

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      title="Conflicting Edits Detected"
      message="Another user or process updated this record while you were editing. To avoid overwriting changes, please reload the latest version."
      severity="warning"
      primaryAction={{
        label: "Reload Latest Changes",
        onClick: () => {
          onClose();
          onReload ? onReload() : window.location.reload();
        },
      }}
      secondaryAction={{
        label: "Keep Editing",
        onClick: onClose,
      }}
    />
  );
}
