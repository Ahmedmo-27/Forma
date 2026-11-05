import { AlertOctagon, Clock, Wrench } from "lucide-react";

export function GlobalStatusBanner({ statusType, message, onAction }) {
  if (!statusType) return null;

  const configs = {
    TENANT_SUSPENDED: {
      Icon: AlertOctagon,
      bg: "bg-red-600",
      defaultMsg: "Your gym's subscription is suspended. Read-only mode is active.",
      actionLabel: "Contact Support",
    },
    SUBSCRIPTION_PAST_DUE: {
      Icon: Clock,
      bg: "bg-amber-600",
      defaultMsg: "Your subscription payment is past due. Data changes are disabled until settled.",
      actionLabel: "Settle Payment",
    },
    MAINTENANCE_MODE: {
      Icon: Wrench,
      bg: "bg-blue-600",
      defaultMsg: "System maintenance is in progress. Some features may be temporarily unavailable.",
      actionLabel: "Refresh",
    },
  };

  const config = configs[statusType] || configs.TENANT_SUSPENDED;
  const Icon = config.Icon;

  return (
    <div
      role="banner"
      className={`w-full ${config.bg} text-white py-2 px-4 text-xs font-medium flex items-center justify-between gap-3 shadow-sm`}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message || config.defaultMsg}</span>
      </div>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white font-semibold transition-colors cursor-pointer text-[11px]"
        >
          {config.actionLabel}
        </button>
      )}
    </div>
  );
}
