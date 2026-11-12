import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

/**
 * Per-item scroll reveals via ScrollTrigger.batch for `.mkt-batch` children.
 */
export function useBatchReveal({
  y = 36,
  x = 0,
  scale = 1,
  start = "top 92%",
  stagger = 0.08,
  duration = 0.65,
} = {}) {
  const ref = useRef(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      const items = root.querySelectorAll(".mkt-batch");
      if (!items.length) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { reduceMotion } = context.conditions;
          if (reduceMotion) {
            gsap.set(items, {
              autoAlpha: 1,
              x: 0,
              y: 0,
              scale: 1,
              clearProps: "transform",
            });
            return;
          }

          gsap.set(items, { autoAlpha: 0, x, y, scale });

          const batch = ScrollTrigger.batch(items, {
            start,
            once: true,
            onEnter: (batchItems) => {
              gsap.to(batchItems, {
                autoAlpha: 1,
                x: 0,
                y: 0,
                scale: 1,
                duration,
                ease: "power3.out",
                stagger: { each: stagger, from: "start" },
                overwrite: "auto",
              });
            },
          });

          return () => {
            batch.forEach((st) => st.kill());
          };
        }
      );

      return () => mm.revert();
    },
    { scope: ref, dependencies: [y, x, scale, start, stagger, duration] }
  );

  return ref;
}
