import { cn } from "../lib/utils/cn";

export function Avatar({
  name = "",
  size = "md", // sm | md | lg
  status, // online | offline | busy
  className = "",
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "SA";

  const sizeClasses = {
    xs: "w-5 h-5 text-[9px]",
    sm: "w-6 h-6 text-[10px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm",
  }[size] || "w-8 h-8 text-xs";

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-semibold select-none border border-[var(--platform-border)]",
          "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-primary)] platform-mono",
          sizeClasses,
          className
        )}
      >
        {initials}
      </div>

      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-[var(--platform-surface)]",
            status === "online" && "bg-[var(--platform-success)]",
            status === "busy" && "bg-[var(--platform-danger)]",
            status === "offline" && "bg-[var(--platform-text-muted)]"
          )}
        />
      )}
    </div>
  );
}
