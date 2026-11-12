import { useRef } from "react";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

/**
 * Scrubs a progress fill (`.marketing-steps-progress-fill`) while the steps
 * shell is in view, and reveals `.marketing-step` items as progress advances.
 */
export function useScrubProgress({
  start = "top 75%",
  end = "bottom 55%",
} = {}) {
  const ref = useRef(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      const fill = root.querySelector(".marketing-steps-progress-fill");
      const steps = root.querySelectorAll(".marketing-step");
      const head = root.querySelector(".marketing-section-head");

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { reduceMotion } = context.conditions;

          if (reduceMotion) {
            if (fill) gsap.set(fill, { scaleX: 1 });
            gsap.set([head, steps].flat().filter(Boolean), {
              autoAlpha: 1,
              y: 0,
              clearProps: "transform",
            });
            return;
          }

          if (head) {
            gsap.set(head, { autoAlpha: 0, y: 24 });
            gsap.to(head, {
              autoAlpha: 1,
              y: 0,
              duration: 0.65,
              ease: "power3.out",
              scrollTrigger: {
                trigger: root,
                start: "top 88%",
                toggleActions: "play none none none",
              },
            });
          }

          if (fill) {
            gsap.set(fill, { scaleX: 0, transformOrigin: "left center" });
            gsap.to(fill, {
              scaleX: 1,
              ease: "none",
              scrollTrigger: {
                trigger: root,
                start,
                end,
                scrub: 0.45,
              },
            });
          }

          if (steps.length) {
            gsap.set(steps, { autoAlpha: 0, y: 28 });
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: root,
                start,
                end,
                scrub: 0.55,
              },
            });
            steps.forEach((step, i) => {
              const at = i / Math.max(steps.length, 1);
              tl.to(
                step,
                {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.28,
                  ease: "power2.out",
                },
                at
              );
            });
          }
        }
      );

      return () => mm.revert();
    },
    { scope: ref, dependencies: [start, end] }
  );

  return ref;
}
