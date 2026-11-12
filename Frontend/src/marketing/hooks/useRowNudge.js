import { useRef } from "react";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

/**
 * Subtle horizontal nudge on fine-pointer hover for matching row selectors.
 */
export function useRowNudge({
  selector = ".mkt-nudge",
  strength = 8,
} = {}) {
  const ref = useRef(null);

  useGSAP(
    (_ctx, contextSafe) => {
      const root = ref.current;
      if (!root) return;

      const rows = root.querySelectorAll(selector);
      if (!rows.length) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isFine: "(pointer: fine)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { isFine, reduceMotion } = context.conditions;
          if (!isFine || reduceMotion) return;

          const cleanups = [];

          rows.forEach((row) => {
            const onEnter = contextSafe(() => {
              gsap.to(row, {
                x: strength,
                duration: 0.35,
                ease: "power3.out",
                overwrite: "auto",
              });
            });
            const onLeave = contextSafe(() => {
              gsap.to(row, {
                x: 0,
                duration: 0.5,
                ease: "power3.out",
                overwrite: "auto",
              });
            });
            row.addEventListener("pointerenter", onEnter);
            row.addEventListener("pointerleave", onLeave);
            cleanups.push(() => {
              row.removeEventListener("pointerenter", onEnter);
              row.removeEventListener("pointerleave", onLeave);
            });
          });

          return () => cleanups.forEach((fn) => fn());
        }
      );

      return () => mm.revert();
    },
    { scope: ref, dependencies: [selector, strength] }
  );

  return ref;
}
