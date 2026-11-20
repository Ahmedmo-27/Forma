
import { ErrorModal } from "./ErrorModal";
import { useI18n } from "../../i18n/useI18n";

export function PaymentFailedModal({ isOpen, onClose, error, onRetryPayment }) {
  const { t } = useI18n();
  if (!isOpen) return null;

  const rawMsg = error?.message || t("Transaction declined by the payment provider.");
  const displayMsg = `${rawMsg}\n\n${t("Important: Your card was not charged, and no balance was deducted from your account.")}`;

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      error={error}
      title={t("Payment Unsuccessful")}
      message={displayMsg}
      severity="danger"
      primaryAction={{
        label: t("Try Payment Again"),
        onClick: () => {
          onClose();
          onRetryPayment?.();
        },
      }}
      secondaryAction={{
        label: t("Cancel"),
        onClick: onClose,
      }}
    />
  );
}
