import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function Pagination({
  page = 1,
  total,
  totalPages: totalPagesProp,
  limit = 20,
  onPageChange,
  className = "",
}) {
  const effectiveTotalPages = totalPagesProp != null
    ? Math.max(1, totalPagesProp)
    : Math.max(1, Math.ceil((total || 0) / limit));

  const hasTotal = typeof total === "number" && total > 0;
  const startItem = hasTotal ? (page - 1) * limit + 1 : 0;
  const endItem = hasTotal ? Math.min(page * limit, total) : 0;

  if (effectiveTotalPages <= 1 && (!hasTotal || total <= limit)) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--platform-text-secondary)] select-none",
        className
      )}
    >
      <div className="platform-mono text-[11px] text-[var(--platform-text-muted)]">
        {hasTotal ? (
          <>
            Showing <span className="font-semibold text-[var(--platform-text-primary)]">{startItem}</span> to{" "}
            <span className="font-semibold text-[var(--platform-text-primary)]">{endItem}</span> of{" "}
            <span className="font-semibold text-[var(--platform-text-primary)]">{total}</span> entries
          </>
        ) : (
          <>
            Page <span className="font-semibold text-[var(--platform-text-primary)]">{page}</span> of{" "}
            <span className="font-semibold text-[var(--platform-text-primary)]">{effectiveTotalPages}</span>
          </>
        )}
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
          {page} / {effectiveTotalPages}
        </div>

        <button
          type="button"
          disabled={page >= effectiveTotalPages}
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
