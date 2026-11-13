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

/**
 * Shared bilingual solution landing (Egypt / WhatsApp CRM / multi-branch).
 * @param {"egypt"|"whatsapp"|"multiBranch"} solutionKey
 * @param {string} barePath e.g. "/gym-management-software-egypt"
 */
export default function SolutionPage({ solutionKey, barePath }) {
  const { t, path, locale } = useMarketingI18n();
  const s = t.solutions[solutionKey];
  const introRef = useScrollReveal({ self: true, y: 28 });
  const pointsRef = useScrollReveal({ stagger: 0.09, from: { y: 22 } });
  const faqRef = useScrollReveal({ stagger: 0.07, y: 18 });
  const bandRef = useScrollReveal({ self: true, y: 32 });
  const pageRef = useRef(null);

  if (!s) return null;

  return (
    <div ref={pageRef}>
      <MarketingHelmet
        title={s.title}
        description={s.description}
        path={path(barePath)}
        jsonLd={faqJsonLd(s.faq, locale)}
      />

      <section className="marketing-section" aria-labelledby="solution-hero">
        <div className="marketing-shell" ref={introRef}>
          <div className="marketing-section-head">
            <h1 id="solution-hero">{s.h1}</h1>
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
        aria-labelledby="solution-points"
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

      <section className="marketing-section" style={{ paddingTop: 0 }} aria-labelledby="solution-faq">
        <div className="marketing-shell" ref={faqRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="solution-faq">{t.home.faqHeading}</h2>
          </div>
          <MarketingFaq items={s.faq} />
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="solution-cta">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="solution-cta">{s.ctaHeading}</h2>
            <p>{s.ctaBody}</p>
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
