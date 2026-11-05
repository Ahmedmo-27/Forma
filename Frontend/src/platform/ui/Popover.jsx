import { useState, useRef, useEffect } from "react";
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

  const containerRef = useRef(null);

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternalIsOpen(next);
    onOpenChange?.(next);
  };

  const close = () => {
    if (!isControlled) setInternalIsOpen(false);
    onOpenChange?.(false);
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close();
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        close();
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
  }, [isOpen]);

  const alignClasses = {
    start: "left-0",
    end: "right-0",
    center: "left-1/2 -translate-x-1/2",
  }[align] || "left-0";

  return (
    <div ref={containerRef} className="relative inline-flex">
      <div onClick={toggle} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          role="dialog"
          className={cn(
            "absolute z-50 top-full mt-1.5 rounded-[var(--platform-radius-lg)] p-3",
            "bg-[var(--platform-surface-raised)] border border-[var(--platform-border)] text-[var(--platform-text-primary)] text-xs",
            "animate-in fade-in zoom-in-95 duration-150",
            alignClasses,
            className
          )}
          style={{ boxShadow: "var(--platform-shadow-popover)" }}
        >
          {typeof content === "function" ? content({ close }) : content}
        </div>
      )}
    </div>
  );
}
