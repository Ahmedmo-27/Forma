
import { ErrorModal } from "./ErrorModal";
import { useI18n } from "../../i18n/useI18n";

export function UpgradeRequiredModal({ isOpen, onClose, error, onNavigateBilling }) {
  const { t } = useI18n();
  if (!isOpen) return null;

  const isLimit = error?.code === "PLAN_LIMIT_REACHED";
  const isOutsidePlan = error?.code === "FEATURE_NOT_IN_PLAN" || error?.code === "ROLE_NOT_IN_PLAN";
  const limitName = error?.details?.limit ? t(error.details.limit) : t("members");
  const current = error?.details?.current ?? "--";
  const max = error?.details?.max ?? "--";
  const feature = error?.details?.feature || error?.feature
    ? t(error.details?.feature || error.feature)
    : t("this feature");
  const requiredPlan = error?.details?.requiredPlan || null;

  // Check user role from localStorage
  let isOwner = false;
  let isImpersonation = false;
  try {
    const rawUser = localStorage.getItem("ff_user");
    if (rawUser) {
      const u = JSON.parse(rawUser);
      isOwner = u.role === "Owner";
      isImpersonation = Boolean(u.isImpersonation);
    }
  } catch (_) {}

  const title = isLimit
    ? t("Plan Limit Reached")
    : isOutsidePlan
      ? t("Outside current plan")
      : t("Upgrade Required");
  const message = isLimit
    ? t("You have reached your current plan limit of {max} {limit} (currently using {current}). Upgrade your plan to expand your gym's capacity.", { max, limit: limitName, current })
    : isOutsidePlan
      ? t("The {feature} feature is outside your current plan. You can keep working in other areas; ask your platform administrator if this gym needs it enabled.", { feature })
      : requiredPlan
        ? t("The {feature} feature is not included in your current subscription. Upgrade to the {plan} tier to unlock it.", { feature, plan: requiredPlan })
        : t("The {feature} feature is not included in your current subscription.", { feature });

  const primaryAction = isOutsidePlan
    ? {
        label: t("View Plan & Usage"),
        onClick: () => {
          onClose();
          window.location.href = "/owner/settings?tab=plan";
        },
      }
    : {
        label: isOwner && !isImpersonation ? t("Upgrade Plan") : t("Contact Gym Owner"),
        onClick: () => {
          onClose();
          if (isOwner && !isImpersonation && onNavigateBilling) {
            onNavigateBilling();
          } else if (isOwner && !isImpersonation) {
            window.location.href = "/owner/settings?tab=plan";
          }
        },
      };

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      error={error}
      title={title}
      message={message}
      severity="info"
      primaryAction={primaryAction}
      secondaryAction={{
        label: t("Close"),
        onClick: onClose,
      }}
    />
  );
}
