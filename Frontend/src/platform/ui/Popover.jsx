import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils/cn";

export function Popover({
  trigger,
  content,
  align = "start", // start | end | center
  className = "",
  isOpen: controlledIsOpen,
  onOpenChange,
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const toggle = (e) => {
    e?.stopPropagation?.();
    const next = !isOpen;
    if (!isControlled) setInternalIsOpen(next);
    onOpenChange?.(next);
  };

  const close = () => {
    if (!isControlled) setInternalIsOpen(false);
    onOpenChange?.(false);
  };

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

    const popoverEl = popoverRef.current;
    const popWidth = popoverEl ? popoverEl.offsetWidth : 180;
    const popHeight = popoverEl ? popoverEl.offsetHeight : 150;

    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    let top = triggerRect.bottom + 6;

    if (spaceBelow < popHeight + 8 && spaceAbove > spaceBelow) {
      top = Math.max(8, triggerRect.top - popHeight - 6);
    }

    let left;
    if (align === "end") {
      left = triggerRect.right - popWidth;
    } else if (align === "center") {
      left = triggerRect.left + triggerRect.width / 2 - popWidth / 2;
    } else {
      left = triggerRect.left;
    }

    if (left + popWidth > window.innerWidth - 8) {
      left = window.innerWidth - popWidth - 8;
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
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        close();
      }
    }

    function handleScrollOrResize() {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          close();
          return;
        }
      }
      updatePosition();
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        close();
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
  }, [isOpen, updatePosition]);

  return (
    <>
      <div ref={triggerRef} onClick={toggle} className="inline-flex cursor-pointer">
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
              boxShadow: "var(--platform-shadow-popover)",
            }}
            className={cn(
              "rounded-[var(--platform-radius-lg)] p-3",
              "bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] text-[var(--platform-text-primary)] text-xs",
              "animate-in fade-in zoom-in-95 duration-150",
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {typeof content === "function" ? content({ close }) : content}
          </div>,
          document.body
        )}
    </>
  );
}
