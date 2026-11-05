import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils/cn";

export function DropdownMenu({
  trigger,
  items = [], // [{ label, icon: Icon, onClick, danger, disabled, divider, header, shortcut }]
  align = "end", // start | end
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (!isOpen) return;

      const actionItems = items.filter((item) => !item.divider && !item.header && !item.disabled);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < actionItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : actionItems.length - 1));
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const selected = actionItems[highlightedIndex];
        if (selected && !selected.disabled) {
          selected.onClick?.();
          setIsOpen(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, items, highlightedIndex]);

  const alignClasses = align === "start" ? "left-0" : "right-0";

  let actionCounter = -1;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <div
        onClick={() => {
          setIsOpen((prev) => !prev);
          setHighlightedIndex(0);
        }}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 top-full mt-1.5 w-48 rounded-[var(--platform-radius-lg)] p-1",
            "bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] text-xs",
            "animate-in fade-in zoom-in-95 duration-100",
            alignClasses,
            className
          )}
          style={{ boxShadow: "var(--platform-shadow-popover)" }}
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return (
                <div
                  key={`div-${idx}`}
                  className="my-1 h-[1px] bg-[var(--platform-border-subtle)]"
                />
              );
            }

            if (item.header) {
              return (
                <div
                  key={`hdr-${idx}`}
                  className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] select-none"
                >
                  {item.label}
                </div>
              );
            }

            actionCounter++;
            const isHighlighted = highlightedIndex === actionCounter;
            const ItemIcon = item.icon;

            return (
              <button
                key={item.label || idx}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(actionCounter)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-[var(--platform-radius-sm)] text-xs text-left transition-colors cursor-pointer outline-none select-none",
                  item.danger
                    ? "text-[var(--platform-danger)] hover:bg-[var(--platform-danger-subtle)]"
                    : "text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-subtle)]",
                  isHighlighted &&
                    (item.danger
                      ? "bg-[var(--platform-danger-subtle)]"
                      : "bg-[var(--platform-surface-subtle)] text-[var(--platform-text-primary)]"),
                  item.disabled && "opacity-50 cursor-not-allowed pointer-events-none"
                )}
              >
                <div className="flex items-center gap-2">
                  {ItemIcon && <ItemIcon className="w-3.5 h-3.5 shrink-0" />}
                  <span>{item.label}</span>
                </div>
                {item.shortcut && (
                  <span className="text-[10px] platform-mono text-[var(--platform-text-muted)]">
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
