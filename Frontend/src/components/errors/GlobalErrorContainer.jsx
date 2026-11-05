import { useState, useEffect } from "react";
import { subscribeErrorEvents } from "../../lib/errorBus";
import { ErrorModal } from "./ErrorModal";
import { UpgradeRequiredModal } from "./UpgradeRequiredModal";
import { SessionExpiredModal } from "./SessionExpiredModal";
import { RateLimitedModal } from "./RateLimitedModal";
import { ConflictModal } from "./ConflictModal";
import { ImportErrorsModal } from "./ImportErrorsModal";
import { PaymentFailedModal } from "./PaymentFailedModal";
import { OfflineBanner } from "./OfflineBanner";
import { GlobalStatusBanner } from "./GlobalStatusBanner";

export function GlobalErrorContainer() {
  const [activeModal, setActiveModal] = useState(null); // { type, error, options }
  const [persistentStatus, setPersistentStatus] = useState(null); // { type, message }

  useEffect(() => {
    const unsubscribe = subscribeErrorEvents(({ error, options }) => {
      if (!error || error.isCancelled) return;

      const code = error.code;

      // 1. Persistent Banner States
      if (code === "TENANT_SUSPENDED" || code === "SUBSCRIPTION_PAST_DUE" || code === "MAINTENANCE_MODE") {
        setPersistentStatus({
          type: code,
          message: error.message,
        });
      }

      // 2. Specialized Modals
      if (code === "PLAN_LIMIT_REACHED" || code === "FEATURE_NOT_IN_PLAN" || code === "ROLE_NOT_IN_PLAN") {
        setActiveModal({ type: "upgrade", error, options });
      } else if (code === "AUTH_TOKEN_EXPIRED" || code === "AUTH_SESSION_REVOKED") {
        setActiveModal({ type: "session", error, options });
      } else if (code === "RATE_LIMITED" || code === "AUTH_ACCOUNT_LOCKED") {
        setActiveModal({ type: "ratelimit", error, options });
      } else if (code === "VERSION_CONFLICT") {
        setActiveModal({ type: "conflict", error, options });
      } else if (code === "IMPORT_ROW_ERRORS") {
        setActiveModal({ type: "import", error, options });
      } else if (code.startsWith("BILLING_PAYMENT_FAILED") || code === "BILLING_SEATS_SOLD_OUT") {
        setActiveModal({ type: "payment", error, options });
      } else if (error.status >= 500 || options.modal) {
        // Generic 500 / unexpected operational error
        setActiveModal({ type: "generic", error, options });
      }
    });

    return () => unsubscribe();
  }, []);

  const closeModal = () => setActiveModal(null);

  return (
    <>
      <OfflineBanner />

      {persistentStatus && (
        <GlobalStatusBanner
          statusType={persistentStatus.type}
          message={persistentStatus.message}
          onAction={() => {
            if (persistentStatus.type === "MAINTENANCE_MODE") {
              window.location.reload();
            } else {
              window.location.href = "/settings";
            }
          }}
        />
      )}

      {activeModal?.type === "upgrade" && (
        <UpgradeRequiredModal
          isOpen={true}
          onClose={closeModal}
          error={activeModal.error}
        />
      )}

      {activeModal?.type === "session" && (
        <SessionExpiredModal
          isOpen={true}
          onClose={closeModal}
          onLoginSuccess={closeModal}
        />
      )}

      {activeModal?.type === "ratelimit" && (
        <RateLimitedModal
          isOpen={true}
          onClose={closeModal}
          error={activeModal.error}
        />
      )}

      {activeModal?.type === "conflict" && (
        <ConflictModal
          isOpen={true}
          onClose={closeModal}
          onReload={() => window.location.reload()}
        />
      )}

      {activeModal?.type === "import" && (
        <ImportErrorsModal
          isOpen={true}
          onClose={closeModal}
          errors={activeModal.error?.details?.errors || []}
          totalCount={activeModal.error?.details?.total || 0}
        />
      )}

      {activeModal?.type === "payment" && (
        <PaymentFailedModal
          isOpen={true}
          onClose={closeModal}
          error={activeModal.error}
        />
      )}

      {activeModal?.type === "generic" && (
        <ErrorModal
          isOpen={true}
          onClose={closeModal}
          error={activeModal.error}
          severity="critical"
          primaryAction={{
            label: "Try Again",
            onClick: () => {
              closeModal();
              window.location.reload();
            },
          }}
          secondaryAction={{
            label: "Dismiss",
            onClick: closeModal,
          }}
        />
      )}
    </>
  );
}

export default GlobalErrorContainer;
