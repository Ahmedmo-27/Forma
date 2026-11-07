import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils/cn";

export function Breadcrumbs({ items = [], className = "" }) {
  // items: [{ label, href }]
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumbs" className={cn("flex items-center text-xs", className)}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label || index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight className="w-3 h-3 text-[var(--platform-text-muted)] shrink-0" />
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "font-medium truncate max-w-[9rem] sm:max-w-xs",
                    isLast
                      ? "text-[var(--platform-text-primary)]"
                      : "text-[var(--platform-text-secondary)]"
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  title={item.label}
                  className="text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] transition-colors truncate max-w-[9rem] sm:max-w-xs"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
