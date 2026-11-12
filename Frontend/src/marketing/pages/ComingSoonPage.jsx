import { useRef } from "react";
import { SALES_MAILTO, SALES_EMAIL, appOrigin } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingHelmet from "../components/MarketingHelmet";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";
import "../styles/marketing.css";

registerMarketingGsap();

export default function ComingSoonPage({ message }) {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const slash = root.querySelector(".marketing-soon-slash");
      const panel = root.querySelector(".marketing-soon-panel");
      const mark = root.querySelector(".marketing-soon-mark");
      const status = root.querySelector(".marketing-soon-status");
      const title = root.querySelector(".marketing-soon-title");
      const copy = root.querySelector(".marketing-soon-copy");
      const actions = root.querySelector(".marketing-soon-actions");
      const foot = root.querySelector(".marketing-soon-foot");

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set([slash, panel, mark, status, title, copy, actions, foot], {
          autoAlpha: 1,
          y: 0,
          x: 0,
          scale: 1,
          clearProps: "transform",
        });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(slash, { autoAlpha: 0, xPercent: 10, rotation: -6 });
        gsap.set(panel, { autoAlpha: 0, y: 36, scale: 0.97 });
        gsap.set([mark, status, title, copy, actions, foot], { autoAlpha: 0, y: 16 });

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.to(slash, { autoAlpha: 0.12, xPercent: 0, rotation: 0, duration: 1.15 }, 0)
          .to(panel, { autoAlpha: 1, y: 0, scale: 1, duration: 0.85 }, 0.1)
          .to(mark, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.4")
          .to(status, { autoAlpha: 1, y: 0, duration: 0.45 }, "-=0.28")
          .to(title, { autoAlpha: 1, y: 0, duration: 0.55 }, "-=0.22")
          .to(copy, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.3")
          .to(actions, { autoAlpha: 1, y: 0, duration: 0.45 }, "-=0.28")
          .to(foot, { autoAlpha: 1, y: 0, duration: 0.4 }, "-=0.25");

        if (slash) {
          gsap.to(slash, {
            yPercent: 3,
            duration: 6,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
        }
      });

      return () => mm.revert();
    },
    { scope: rootRef }
  );

  return (
    <div className="marketing-root marketing-soon" ref={rootRef}>
      <MarketingHelmet
        title="Under development — Forma"
        description="Forma’s public site is under development. Contact sales for early access."
        path="/"
        noIndex
      />

      <section className="marketing-soon-stage" aria-labelledby="soon-heading">
        <div className="marketing-soon-slash" aria-hidden="true" />
        <div className="marketing-soon-glow" aria-hidden="true" />

        <div className="marketing-shell marketing-soon-shell">
          <div className="marketing-soon-panel">
            <img
              src="/forma-mark.jpeg"
              alt=""
              className="marketing-soon-mark"
              width={72}
              height={72}
            />

            <p className="marketing-soon-status">
              <span className="marketing-soon-pulse" aria-hidden="true" />
              Under development
            </p>

            <h1 id="soon-heading" className="marketing-soon-title">
              Forma is taking shape.
            </h1>

            <p className="marketing-soon-copy">
              {message ||
                "Our public site isn’t open to guests yet. We’re finishing the launch experience — talk to sales if you’d like an early walkthrough."}
            </p>

            <div className="marketing-soon-actions">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                Contact sales
              </MagneticButton>
              <MagneticButton
                className="marketing-btn marketing-btn-ghost"
                href={`${appOrigin()}/login`}
              >
                Staff login
              </MagneticButton>
            </div>

            <p className="marketing-soon-foot">
              <a href={SALES_MAILTO}>{SALES_EMAIL}</a>
              <span aria-hidden="true"> · </span>
              <span>forma-official.com</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
