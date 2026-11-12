import { useRef } from "react";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

/**
 * Single row with fine-pointer GSAP nudge on hover.
 * Prefer `useRowNudge` on a parent when many rows share a list.
 */
export default function RevealRow({
  as: Tag = "div",
  className = "",
  strength = 8,
  children,
  ...rest
}) {
  const ref = useRef(null);

  useGSAP(
    (_ctx, contextSafe) => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isFine: "(pointer: fine)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { isFine, reduceMotion } = context.conditions;
          if (!isFine || reduceMotion) return;

          const onEnter = contextSafe(() => {
            gsap.to(el, {
              x: strength,
              duration: 0.35,
              ease: "power3.out",
              overwrite: "auto",
            });
          });
          const onLeave = contextSafe(() => {
            gsap.to(el, {
              x: 0,
              duration: 0.5,
              ease: "power3.out",
              overwrite: "auto",
            });
          });

          el.addEventListener("pointerenter", onEnter);
          el.addEventListener("pointerleave", onLeave);
          return () => {
            el.removeEventListener("pointerenter", onEnter);
            el.removeEventListener("pointerleave", onLeave);
          };
        }
      );

      return () => mm.revert();
    },
    { scope: ref, dependencies: [strength] }
  );

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
