import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils/cn";

export function Tooltip({
  content,
  children,
  side = "top", // top | bottom | left | right
  delay = 200,
  className = "",
}) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        hide();
      }
    }
    if (isVisible) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isVisible]);

  if (!content) return children;

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[side] || "bottom-full left-1/2 -translate-x-1/2 mb-1.5";

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 px-2 py-1 text-[11px] font-medium leading-tight rounded-[var(--platform-radius-sm)] whitespace-nowrap pointer-events-none select-none",
            "bg-[var(--platform-surface-raised)] text-[var(--platform-text-primary)] border border-[var(--platform-border)] animate-in fade-in zoom-in-95 duration-100",
            positionClasses,
            className
          )}
          style={{ boxShadow: "var(--platform-shadow-popover)" }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
