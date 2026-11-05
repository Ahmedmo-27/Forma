import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function CopyChip({
  value,
  displayValue,
  prefix = "",
  label,
  className = "",
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!value) return;

    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const textToDisplay = displayValue || value || "—";

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label || `Copy '${value}' to clipboard`}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--platform-radius-sm)] text-[11px] platform-mono font-medium",
        "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-secondary)] border border-[var(--platform-border-subtle)]",
        "hover:border-[var(--platform-border-strong)] hover:text-[var(--platform-text-primary)] transition-all cursor-pointer group select-all",
        className
      )}
    >
      {prefix && <span className="text-[var(--platform-text-muted)]">{prefix}</span>}
      <span className="truncate max-w-[140px] sm:max-w-[200px]">{textToDisplay}</span>
      {copied ? (
        <Check className="w-3 h-3 text-[var(--platform-success)] shrink-0" />
      ) : (
        <Copy className="w-3 h-3 text-[var(--platform-text-muted)] group-hover:text-[var(--platform-text-primary)] shrink-0 transition-colors" />
      )}
    </button>
  );
}
