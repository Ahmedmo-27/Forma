import { useRef } from "react";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingFaq from "../components/MarketingFaq";
import MarketingHelmet from "../components/MarketingHelmet";
import { faqJsonLd } from "../seo";
import { useMarketingI18n } from "../i18n";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

export default function TechnologyPage() {
  const { t, path, locale } = useMarketingI18n();
  const s = t.technology;
  const introRef = useScrollReveal({ self: true, y: 28 });
  const pointsRef = useScrollReveal({ stagger: 0.09, from: { y: 22 } });
  const faqRef = useScrollReveal({ stagger: 0.07, y: 18 });
  const bandRef = useScrollReveal({ self: true, y: 32 });
  const pageRef = useRef(null);

  return (
    <div ref={pageRef}>
      <MarketingHelmet
        title={s.title}
        description={s.description}
        path={path("/technology")}
        jsonLd={faqJsonLd(s.faq, locale)}
      />

      <section className="marketing-section" aria-labelledby="technology-hero">
        <div className="marketing-shell" ref={introRef}>
          <div className="marketing-section-head">
            <h1 id="technology-hero">{s.h1}</h1>
            <p>{s.intro}</p>
          </div>
          <div className="marketing-cta-row" style={{ marginTop: "1.25rem" }}>
            <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
              {t.shared.contactSales}
            </MagneticButton>
            <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/plans")}>
              {t.shared.viewPlans}
            </MagneticButton>
          </div>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ paddingTop: 0 }}
        aria-labelledby="technology-points"
      >
        <div className="marketing-shell" ref={pointsRef}>
          <div className="marketing-why-list">
            {s.points.map((point) => (
              <div className="marketing-why-row mkt-reveal" key={point.title}>
                <h2 className="marketing-solution-point-title">{point.title}</h2>
                <p>{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section" style={{ paddingTop: 0 }} aria-labelledby="technology-faq">
        <div className="marketing-shell" ref={faqRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="technology-faq">{t.home.faqHeading}</h2>
          </div>
          <MarketingFaq items={s.faq} />
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="technology-cta">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="technology-cta">{s.ctaHeading}</h2>
            <p>{s.ctaBody}</p>
            <div className="marketing-cta-row">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                {t.shared.contactSales}
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/plans")}>
                {t.shared.viewPlans}
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/faq")}>
                {t.footer.faq}
              </MagneticButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
