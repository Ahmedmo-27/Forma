import { cn } from "../lib/utils/cn";

export function Skeleton({ className = "", ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--platform-radius-sm)] bg-[var(--platform-border-strong)]/20",
        className
      )}
      {...props}
    />
  );
}

export function TableRowSkeleton({ columns = 5 }) {
  return (
    <tr className="border-b border-[var(--platform-border-subtle)] animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <Skeleton className="h-3.5 w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-4 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-3 animate-pulse">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-2.5 w-2/3" />
    </div>
  );
}
