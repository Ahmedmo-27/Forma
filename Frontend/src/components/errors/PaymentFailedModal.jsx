import { CreditCard, CheckCircle } from "lucide-react";
import { ErrorModal } from "./ErrorModal";

export function PaymentFailedModal({ isOpen, onClose, error, onRetryPayment }) {
  if (!isOpen) return null;

  const rawMsg = error?.message || "Transaction declined by the payment provider.";
  const displayMsg = `${rawMsg}\n\nImportant: Your card was not charged, and no balance was deducted from your account.`;

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      error={error}
      title="Payment Unsuccessful"
      message={displayMsg}
      severity="danger"
      primaryAction={{
        label: "Try Payment Again",
        onClick: () => {
          onClose();
          onRetryPayment?.();
        },
      }}
      secondaryAction={{
        label: "Cancel",
        onClick: onClose,
      }}
    />
  );
}
