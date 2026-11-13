import { useRef } from "react";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingHelmet from "../components/MarketingHelmet";
import { compareRowsFor } from "../data/compareRows";
import { useMarketingI18n } from "../i18n";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useRowNudge } from "../hooks/useRowNudge";
import { registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

export default function WhyFormaPage() {
  const { t, path, locale } = useMarketingI18n();
  const w = t.why;
  const rows = compareRowsFor(locale);
  const pageRef = useRef(null);
  const introRef = useScrollReveal({ self: true, y: 28 });
  const whyRef = useScrollReveal({
    stagger: 0.09,
    from: { x: locale === "ar" ? -28 : 28, y: 18 },
    alternateX: true,
  });
  const compareRef = useScrollReveal({
    stagger: 0.07,
    from: { y: 22 },
  });
  const bandRef = useScrollReveal({ self: true, y: 36 });
  const nudgeRootRef = useRowNudge({ selector: ".mkt-nudge", strength: 8 });

  const setPageRef = (node) => {
    pageRef.current = node;
    nudgeRootRef.current = node;
  };

  return (
    <div ref={setPageRef}>
      <MarketingHelmet title={w.title} description={w.description} path={path("/why-forma")} />

      <section className="marketing-section" aria-labelledby="why-forma-hero">
        <div className="marketing-shell" ref={introRef}>
          <div className="marketing-section-head">
            <h1 id="why-forma-hero">{w.h1}</h1>
            <p>{w.intro}</p>
          </div>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ paddingTop: 0 }}
        aria-labelledby="why-points-heading"
      >
        <div className="marketing-shell" ref={whyRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="why-points-heading">{w.pointsHeading}</h2>
            <p>{w.pointsIntro}</p>
          </div>
          <div className="marketing-why-list">
            {w.points.map((point) => (
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
        aria-labelledby="compare-heading"
      >
        <div className="marketing-shell" ref={compareRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="compare-heading">{w.compareHeading}</h2>
            <p>{w.compareIntro}</p>
          </div>

          <div
            className="marketing-compare mkt-reveal"
            role="table"
            aria-label={w.compareAria}
          >
            <div className="marketing-compare-head" role="row">
              <div className="marketing-compare-theme" role="columnheader">
                {w.compareTheme}
              </div>
              <div className="marketing-compare-them" role="columnheader">
                {w.compareThem}
              </div>
              <div className="marketing-compare-forma" role="columnheader">
                {w.compareForma}
              </div>
            </div>
            {rows.map((row) => (
              <div className="marketing-compare-row mkt-reveal mkt-nudge" role="row" key={row.theme}>
                <div className="marketing-compare-theme" role="rowheader">
                  {row.theme}
                </div>
                <div className="marketing-compare-them" role="cell" data-label={w.compareLabelThem}>
                  <span className="marketing-compare-label">{w.compareLabelThem}</span>
                  <p>{row.them}</p>
                </div>
                <div className="marketing-compare-forma" role="cell" data-label={w.compareLabelForma}>
                  <span className="marketing-compare-label">{w.compareLabelForma}</span>
                  <p>{row.forma}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="marketing-compare-foot mkt-reveal">{w.compareFoot}</p>
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="why-cta-heading">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="why-cta-heading">{w.ctaHeading}</h2>
            <p>{w.ctaBody}</p>
            <div className="marketing-cta-row">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                {t.shared.contactSales}
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/plans")}>
                {t.shared.viewPlans}
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
