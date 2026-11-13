import { lazy, Suspense, useRef } from "react";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingFaq from "../components/MarketingFaq";
import MarketingHelmet from "../components/MarketingHelmet";
import { homeJsonLd, faqJsonLd, combineJsonLd } from "../seo";
import { useMarketingI18n } from "../i18n";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useBatchReveal } from "../hooks/useBatchReveal";
import { useScrubProgress } from "../hooks/useScrubProgress";
import { useRowNudge } from "../hooks/useRowNudge";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

const HeroGymAccent = lazy(() => import("../components/HeroGymAccent"));

export default function HomePage() {
  const { t, path, locale } = useMarketingI18n();
  const h = t.home;
  const pageRef = useRef(null);
  const heroRef = useRef(null);

  const painRef = useScrollReveal({
    stagger: 0.09,
    from: { x: locale === "ar" ? 24 : -24, y: 16 },
  });
  const howRef = useScrubProgress();
  const builtHeadRef = useScrollReveal({ self: true, y: 24 });
  const builtBatchRef = useBatchReveal({ y: 32, stagger: 0.07 });
  const whyRef = useScrollReveal({
    stagger: 0.09,
    from: { x: locale === "ar" ? -28 : 28, y: 18 },
    alternateX: true,
  });
  const compareTeaserRef = useScrollReveal({ self: true, y: 28 });
  const rolesRef = useScrollReveal({
    stagger: 0.1,
    from: { y: 24, scale: 0.97 },
  });
  const faqRef = useScrollReveal({ stagger: 0.07, y: 22 });
  const bandRef = useScrollReveal({ self: true, y: 36 });
  const nudgeRootRef = useRowNudge({ selector: ".mkt-nudge", strength: 8 });

  useGSAP(
    () => {
      const hero = heroRef.current;
      if (!hero) return;

      const panel = hero.querySelector(".marketing-hero-panel");
      const brand = hero.querySelector(".marketing-hero-brand");
      const title = hero.querySelector("#hero-heading");
      const copy = hero.querySelector(".marketing-hero-copy");
      const ctas = hero.querySelectorAll(".marketing-cta-row > *");
      const slash = hero.querySelector(".marketing-hero-slash");

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          isFine: "(pointer: fine)",
        },
        (context) => {
          const { reduceMotion, isFine } = context.conditions;

          if (reduceMotion) {
            gsap.set([panel, brand, title, copy, ctas, slash], {
              autoAlpha: 1,
              y: 0,
              x: 0,
              scale: 1,
              clearProps: "transform",
            });
            return;
          }

          gsap.set(panel, { autoAlpha: 0, y: 40, scale: 0.97 });
          gsap.set([brand, title, copy], { autoAlpha: 0, y: 18 });
          gsap.set(ctas, { autoAlpha: 0, y: 14 });
          gsap.set(slash, { autoAlpha: 0, xPercent: 12, rotate: -8 });

          const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
          tl.to(slash, { autoAlpha: 0.08, xPercent: 0, rotate: 0, duration: 1.1 }, 0)
            .to(panel, { autoAlpha: 1, y: 0, scale: 1, duration: 0.85 }, 0.08)
            .to(brand, { autoAlpha: 1, y: 0, duration: 0.55 }, "-=0.35")
            .to(title, { autoAlpha: 1, y: 0, duration: 0.6 }, "-=0.28")
            .to(copy, { autoAlpha: 1, y: 0, duration: 0.55 }, "-=0.32")
            .to(ctas, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08 }, "-=0.25");

          if (isFine && panel) {
            const onMove = (e) => {
              const rect = hero.getBoundingClientRect();
              const px = (e.clientX - rect.left) / rect.width - 0.5;
              const py = (e.clientY - rect.top) / rect.height - 0.5;
              gsap.to(panel, {
                x: px * 10,
                y: py * 8,
                duration: 0.6,
                ease: "power2.out",
                overwrite: "auto",
              });
              gsap.to(slash, {
                x: px * -24,
                y: py * -16,
                duration: 0.8,
                ease: "power2.out",
                overwrite: "auto",
              });
            };
            const onLeave = () => {
              gsap.to([panel, slash], {
                x: 0,
                y: 0,
                duration: 0.8,
                ease: "power3.out",
                overwrite: "auto",
              });
            };
            hero.addEventListener("pointermove", onMove);
            hero.addEventListener("pointerleave", onLeave);
            return () => {
              hero.removeEventListener("pointermove", onMove);
              hero.removeEventListener("pointerleave", onLeave);
            };
          }
        }
      );

      return () => mm.revert();
    },
    { scope: pageRef }
  );

  const setPageRef = (node) => {
    pageRef.current = node;
    nudgeRootRef.current = node;
  };

  const jsonLd = combineJsonLd(homeJsonLd(locale), faqJsonLd(h.faq, locale));

  return (
    <div ref={setPageRef}>
      <MarketingHelmet
        title={h.title}
        description={h.description}
        path={path("/")}
        jsonLd={jsonLd}
      />

      <section className="marketing-hero" aria-labelledby="hero-heading" ref={heroRef}>
        <div className="marketing-hero-slash" aria-hidden="true" />
        <div className="marketing-shell">
          <div className="marketing-hero-stage">
            <div className="marketing-hero-panel">
              <img src="/forma-horizontal.jpeg" alt="forma" className="marketing-hero-brand" />
              <h1 id="hero-heading">{h.h1}</h1>
              <p className="marketing-hero-copy">{h.heroCopy}</p>
              <div className="marketing-cta-row">
                <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                  {t.shared.contactSales}
                </MagneticButton>
                <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/plans")}>
                  {h.viewPlans}
                </MagneticButton>
              </div>
            </div>
            <Suspense
              fallback={
                <div className="marketing-hero-3d" aria-hidden="true">
                  <div className="marketing-hero-3d-fallback">
                    <span className="marketing-hero-3d-disc" />
                  </div>
                </div>
              }
            >
              <HeroGymAccent />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="marketing-section" aria-labelledby="pain-heading">
        <div className="marketing-shell" ref={painRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="pain-heading">{h.painHeading}</h2>
            <p>{h.painIntro}</p>
          </div>
          <ul className="marketing-pain-list">
            {h.painItems.map((item) => (
              <li className="mkt-reveal mkt-nudge" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="marketing-section marketing-atmosphere marketing-atmosphere-reception"
        aria-labelledby="how-heading"
      >
        <div className="marketing-shell" ref={howRef}>
          <div className="marketing-section-head">
            <h2 id="how-heading">{h.howHeading}</h2>
            <p>{h.howIntro}</p>
          </div>
          <div className="marketing-steps-progress" aria-hidden="true">
            <div className="marketing-steps-progress-fill" />
          </div>
          <ol className="marketing-steps">
            {h.steps.map((step) => (
              <li className="marketing-step" key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="marketing-section" style={{ paddingTop: 0 }} aria-labelledby="built-heading">
        <div className="marketing-shell">
          <div className="marketing-section-head" ref={builtHeadRef}>
            <h2 id="built-heading">{h.builtHeading}</h2>
            <p>{h.builtIntro}</p>
          </div>
          <div className="marketing-feature-list" ref={builtBatchRef}>
            {h.features.map((feature) => (
              <div className="marketing-feature-row mkt-batch mkt-nudge" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section" style={{ paddingTop: 0 }} aria-labelledby="why-heading">
        <div className="marketing-shell" ref={whyRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="why-heading">{h.whyHeading}</h2>
            <p>{h.whyIntro}</p>
          </div>
          <div className="marketing-why-list">
            {h.whyPoints.map((point) => (
              <div className="marketing-why-row mkt-reveal mkt-nudge" key={point.title}>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ paddingTop: 0 }}
        aria-labelledby="compare-teaser-heading"
      >
        <div className="marketing-shell" ref={compareTeaserRef}>
          <div className="marketing-section-head">
            <h2 id="compare-teaser-heading">{h.compareTeaserHeading}</h2>
            <p>{h.compareTeaserBody}</p>
          </div>
          <div className="marketing-cta-row">
            <MagneticButton className="marketing-btn marketing-btn-primary" to={path("/why-forma")}>
              {t.shared.whyForma}
            </MagneticButton>
            <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/plans")}>
              {h.viewPlans}
            </MagneticButton>
          </div>
        </div>
      </section>

      <section
        className="marketing-section marketing-atmosphere marketing-atmosphere-floor"
        aria-labelledby="roles-heading"
      >
        <div className="marketing-shell" ref={rolesRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="roles-heading">{h.rolesHeading}</h2>
            <p>{h.rolesIntro}</p>
          </div>
          <div className="marketing-roles">
            {h.roles.map((role) => (
              <div className="marketing-role mkt-reveal mkt-nudge" key={role.title}>
                <h3>{role.title}</h3>
                <p>{role.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section" style={{ paddingTop: 0 }} aria-labelledby="faq-heading">
        <div className="marketing-shell" ref={faqRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="faq-heading">{h.faqHeading}</h2>
            <p>{h.faqIntro}</p>
          </div>
          <MarketingFaq items={h.faq} />
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="cta-heading">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="cta-heading">{h.ctaHeading}</h2>
            <p>{h.ctaBody}</p>
            <div className="marketing-cta-row">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                {t.shared.contactSales}
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/get-started")}>
                {t.shared.getStarted}
              </MagneticButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
