import { useRef } from "react";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

/**
 * Fade/slide children into view on scroll. Targets `.mkt-reveal` inside the scoped root,
 * or the root itself when `self` is true.
 *
 * @param {object} options
 * @param {boolean} [options.self]
 * @param {number} [options.y] — shorthand when `from` is omitted
 * @param {number} [options.x]
 * @param {number} [options.scale]
 * @param {{ x?: number, y?: number, scale?: number }} [options.from]
 * @param {number} [options.stagger]
 * @param {string} [options.start]
 * @param {boolean} [options.once]
 * @param {boolean} [options.alternateX] — alternate ±x on each `.mkt-reveal` child
 */
export function useScrollReveal({
  self = false,
  y = 28,
  x = 0,
  scale = 1,
  from,
  stagger = 0.08,
  start = "top 88%",
  once = true,
  alternateX = false,
} = {}) {
  const ref = useRef(null);
  const fromX = from?.x ?? x;
  const fromY = from?.y ?? y;
  const fromScale = from?.scale ?? scale;

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      const targets = self ? root : root.querySelectorAll(".mkt-reveal");
      if (!targets || (targets.length !== undefined && targets.length === 0)) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { reduceMotion } = context.conditions;
          if (reduceMotion) {
            gsap.set(targets, {
              autoAlpha: 1,
              x: 0,
              y: 0,
              scale: 1,
              clearProps: "transform",
            });
            return;
          }

          const nodes = self ? [root] : Array.from(targets);

          nodes.forEach((node, i) => {
            const dirX = alternateX ? (i % 2 === 0 ? -Math.abs(fromX || 28) : Math.abs(fromX || 28)) : fromX;
            gsap.set(node, {
              autoAlpha: 0,
              x: dirX,
              y: fromY,
              scale: fromScale,
            });
          });

          gsap.to(nodes, {
            autoAlpha: 1,
            x: 0,
            y: 0,
            scale: 1,
            duration: 0.7,
            ease: "power3.out",
            stagger,
            scrollTrigger: {
              trigger: root,
              start,
              toggleActions: once ? "play none none none" : "play reverse play reverse",
              once,
            },
          });
        }
      );

      return () => mm.revert();
    },
    {
      scope: ref,
      dependencies: [self, fromX, fromY, fromScale, stagger, start, once, alternateX],
    }
  );

  return ref;
}
