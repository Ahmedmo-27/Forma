import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function Pagination({
  page = 1,
  total = 0,
  limit = 20,
  onPageChange,
  className = "",
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, total);

  if (totalPages <= 1 && total === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--platform-text-secondary)] select-none",
        className
      )}
    >
      <div className="platform-mono text-[11px] text-[var(--platform-text-muted)]">
        Showing <span className="font-semibold text-[var(--platform-text-primary)]">{startItem}</span> to{" "}
        <span className="font-semibold text-[var(--platform-text-primary)]">{endItem}</span> of{" "}
        <span className="font-semibold text-[var(--platform-text-primary)]">{total}</span> entries
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          aria-label="Previous page"
          className="h-7 px-2 rounded-[var(--platform-radius-sm)] border border-[var(--platform-border)] bg-[var(--platform-surface)] hover:bg-[var(--platform-surface-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="px-2 platform-mono text-xs text-[var(--platform-text-primary)] font-medium">
          {page} / {totalPages}
        </div>

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange?.(page + 1)}
          aria-label="Next page"
          className="h-7 px-2 rounded-[var(--platform-radius-sm)] border border-[var(--platform-border)] bg-[var(--platform-surface)] hover:bg-[var(--platform-surface-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
