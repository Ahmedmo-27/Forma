import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils/cn";

export function DropdownMenu({
  trigger,
  items = [], // [{ label, icon: Icon, onClick, danger, disabled, divider, header, shortcut }]
  align = "end", // start | end
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    if (
      triggerRect.width === 0 &&
      triggerRect.height === 0 &&
      triggerRect.top === 0 &&
      triggerRect.left === 0
    ) {
      return;
    }

    const menuEl = menuRef.current;
    const menuWidth = menuEl ? menuEl.offsetWidth : 216; // default w-54
    const menuHeight = menuEl ? menuEl.offsetHeight : 220;

    // Check vertical space
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    let top = triggerRect.bottom + 6;

    // If not enough room below (less than menuHeight + 8) and more room above, flip up
    if (spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow) {
      top = Math.max(8, triggerRect.top - menuHeight - 6);
    }

    // Horizontal alignment
    let left;
    if (align === "end") {
      left = triggerRect.right - menuWidth;
    } else {
      left = triggerRect.left;
    }

    // Clamp to viewport
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 8) {
      left = 8;
    }

    setCoords({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleScrollOrResize() {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          setIsOpen(false);
          return;
        }
      }
      updatePosition();
    }

    function handleKeyDown(e) {
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

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, items, highlightedIndex, updatePosition]);

  let actionCounter = -1;

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
          setHighlightedIndex(0);
        }}
        className="inline-flex cursor-pointer"
      >
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
              boxShadow: "var(--platform-shadow-popover)",
            }}
            className={cn(
              "w-54 rounded-[var(--platform-radius-lg)] p-1",
              "bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] text-xs",
              "animate-in fade-in zoom-in-95 duration-100",
              className
            )}
            onClick={(e) => e.stopPropagation()}
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
                    className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] select-none truncate"
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
                  onClick={(e) => {
                    e.stopPropagation();
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
                  <div className="flex items-center gap-2 truncate">
                    {ItemIcon && <ItemIcon className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <span className="text-[10px] platform-mono text-[var(--platform-text-muted)] ml-2 shrink-0">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
