import { Sparkles, ArrowRight } from "lucide-react";
import { ErrorModal } from "./ErrorModal";

export function UpgradeRequiredModal({ isOpen, onClose, error, onNavigateBilling }) {
  if (!isOpen) return null;

  const isLimit = error?.code === "PLAN_LIMIT_REACHED";
  const limitName = error?.details?.limit || "members";
  const current = error?.details?.current ?? "--";
  const max = error?.details?.max ?? "--";
  const feature = error?.details?.feature || "this feature";
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

  const title = isLimit ? "Plan Limit Reached" : "Upgrade Required";
  const message = isLimit
    ? `You have reached your current plan limit of ${max} ${limitName} (currently using ${current}). Upgrade your plan to expand your gym's capacity.`
    : requiredPlan
      ? `The ${feature} feature is not included in your current subscription. Upgrade to the ${requiredPlan} tier to unlock it.`
      : `The ${feature} feature is not included in your current subscription.`;

  return (
    <ErrorModal
      isOpen={isOpen}
      onClose={onClose}
      error={error}
      title={title}
      message={message}
      severity="info"
      primaryAction={{
        label: isOwner ? "Upgrade Plan" : "Contact Gym Owner",
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
        label: "Close",
        onClick: onClose,
      }}
    />
  );
}
