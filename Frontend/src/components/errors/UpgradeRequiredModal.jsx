
import { ErrorModal } from "./ErrorModal";
import { useI18n } from "../../i18n/useI18n";

export function UpgradeRequiredModal({ isOpen, onClose, error, onNavigateBilling }) {
  const { t } = useI18n();
  if (!isOpen) return null;

  const isLimit = error?.code === "PLAN_LIMIT_REACHED";
  const limitName = error?.details?.limit ? t(error.details.limit) : t("members");
  const current = error?.details?.current ?? "--";
  const max = error?.details?.max ?? "--";
  const feature = error?.details?.feature ? t(error.details.feature) : t("this feature");
  const requiredPlan = error?.details?.requiredPlan || null;

  // Check user role from localStorage
  let isOwner = false;
  try {
    const rawUser = localStorage.getItem("ff_user");
    if (rawUser) {
      const u = JSON.parse(rawUser);
      isOwner = u.role === "Owner";
    }
  } catch (_) {}

  const title = isLimit ? t("Plan Limit Reached") : t("Upgrade Required");
  const message = isLimit
    ? t("You have reached your current plan limit of {max} {limit} (currently using {current}). Upgrade your plan to expand your gym's capacity.", { max, limit: limitName, current })
    : requiredPlan
      ? t("The {feature} feature is not included in your current subscription. Upgrade to the {plan} tier to unlock it.", { feature, plan: requiredPlan })
      : t("The {feature} feature is not included in your current subscription.", { feature });

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      error={error}
      title={title}
      message={message}
      severity="info"
      primaryAction={{
        label: isOwner ? t("Upgrade Plan") : t("Contact Gym Owner"),
        onClick: () => {
          onClose();
          if (isOwner && onNavigateBilling) {
            onNavigateBilling();
          } else if (isOwner) {
            window.location.href = "/settings";
          }
        },
      }}
      secondaryAction={{
        label: t("Close"),
        onClick: onClose,
      }}
    />
  );
}
