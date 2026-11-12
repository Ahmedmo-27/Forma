import { useId, useState, useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Accessible FAQ accordion with GSAP height / opacity open-close.
 */
export default function MarketingFaq({ items }) {
  const baseId = useId();
  const rootRef = useRef(null);
  const [openIndex, setOpenIndex] = useState(0);
  const openRef = useRef(0);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const panels = root.querySelectorAll(".marketing-faq-a");
      const icons = root.querySelectorAll(".marketing-faq-icon");
      const open = openRef.current;

      panels.forEach((panel, i) => {
        const isOpen = i === open;
        gsap.set(panel, {
          height: isOpen ? "auto" : 0,
          autoAlpha: isOpen ? 1 : 0,
          overflow: "hidden",
        });
      });
      icons.forEach((icon, i) => {
        gsap.set(icon, { rotate: i === open ? 45 : 0 });
      });
    },
    { scope: rootRef, dependencies: [items.length] }
  );

  const onToggle = (index) => {
    const root = rootRef.current;
    if (!root) return;

    const next = openRef.current === index ? -1 : index;
    const prev = openRef.current;
    const panels = root.querySelectorAll(".marketing-faq-a");
    const icons = root.querySelectorAll(".marketing-faq-icon");
    const reduce = prefersReducedMotion();

    panels.forEach((panel, i) => {
      const shouldOpen = i === next;
      const wasOpen = i === prev;

      if (reduce) {
        gsap.set(panel, {
          height: shouldOpen ? "auto" : 0,
          autoAlpha: shouldOpen ? 1 : 0,
          overflow: "hidden",
        });
        return;
      }

      if (shouldOpen && !wasOpen) {
        gsap.set(panel, { height: 0, autoAlpha: 0, overflow: "hidden" });
        gsap.to(panel, {
          height: "auto",
          autoAlpha: 1,
          duration: 0.45,
          ease: "power3.out",
          overwrite: "auto",
          onComplete: () => ScrollTrigger.refresh(),
        });
      } else if (!shouldOpen && wasOpen) {
        gsap.to(panel, {
          height: 0,
          autoAlpha: 0,
          duration: 0.35,
          ease: "power2.inOut",
          overwrite: "auto",
          onComplete: () => ScrollTrigger.refresh(),
        });
      }
    });

    icons.forEach((icon, i) => {
      gsap.to(icon, {
        rotate: i === next ? 45 : 0,
        duration: reduce ? 0 : 0.35,
        ease: "power2.out",
        overwrite: "auto",
      });
    });

    openRef.current = next;
    setOpenIndex(next);
  };

  return (
    <div className="marketing-faq" ref={rootRef}>
      {items.map((item, index) => {
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-btn-${index}`;
        const isOpen = openIndex === index;

        return (
          <div className="marketing-faq-item mkt-reveal" key={item.q}>
            <h3 className="marketing-faq-q">
              <button
                type="button"
                id={buttonId}
                className="marketing-faq-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => onToggle(index)}
              >
                <span>{item.q}</span>
                <span className="marketing-faq-icon" aria-hidden="true">
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              aria-hidden={!isOpen}
              className="marketing-faq-a"
            >
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
