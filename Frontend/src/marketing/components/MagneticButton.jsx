import { useRef } from "react";
import { Link } from "react-router-dom";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

/**
 * Subtle magnetic pull toward the cursor. Disabled under reduced motion.
 */
export default function MagneticButton({
  href,
  to,
  className = "",
  children,
  strength = 18,
  ...rest
}) {
  const rootRef = useRef(null);
  const innerRef = useRef(null);

  useGSAP(
    (_ctx, contextSafe) => {
      const root = rootRef.current;
      const inner = innerRef.current;
      if (!root || !inner) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isFine: "(pointer: fine)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { isFine, reduceMotion } = context.conditions;
          if (!isFine || reduceMotion) return;

          const onMove = contextSafe((e) => {
            const rect = root.getBoundingClientRect();
            const x = e.clientX - (rect.left + rect.width / 2);
            const y = e.clientY - (rect.top + rect.height / 2);
            gsap.to(inner, {
              x: x * 0.28,
              y: y * 0.28,
              duration: 0.35,
              ease: "power3.out",
              overwrite: "auto",
            });
            gsap.to(root, {
              x: gsap.utils.clamp(-strength, strength, x * 0.12),
              y: gsap.utils.clamp(-strength, strength, y * 0.12),
              duration: 0.35,
              ease: "power3.out",
              overwrite: "auto",
            });
          });

          const onLeave = contextSafe(() => {
            gsap.to([root, inner], {
              x: 0,
              y: 0,
              duration: 0.55,
              ease: "elastic.out(1, 0.45)",
              overwrite: "auto",
            });
          });

          root.addEventListener("pointermove", onMove);
          root.addEventListener("pointerleave", onLeave);
          return () => {
            root.removeEventListener("pointermove", onMove);
            root.removeEventListener("pointerleave", onLeave);
          };
        }
      );

      return () => mm.revert();
    },
    { scope: rootRef }
  );

  const content = (
    <span ref={innerRef} className="marketing-magnetic-inner">
      {children}
    </span>
  );

  if (to) {
    return (
      <Link ref={rootRef} to={to} className={`marketing-magnetic ${className}`.trim()} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <a ref={rootRef} href={href} className={`marketing-magnetic ${className}`.trim()} {...rest}>
      {content}
    </a>
  );
}
