import { useMemo, useRef } from "react";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingFaq from "../components/MarketingFaq";
import MarketingHelmet from "../components/MarketingHelmet";
import { faqCorpus } from "../faqCorpus";
import { faqJsonLd } from "../seo";
import { useMarketingI18n } from "../i18n";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

export default function FaqPage() {
  const { t, path, locale } = useMarketingI18n();
  const page = t.faqPage;
  const items = useMemo(() => faqCorpus(t), [t]);
  const introRef = useScrollReveal({ self: true, y: 28 });
  const faqRef = useScrollReveal({ stagger: 0.07, y: 18 });
  const bandRef = useScrollReveal({ self: true, y: 32 });
  const pageRef = useRef(null);

  return (
    <div ref={pageRef}>
      <MarketingHelmet
        title={page.title}
        description={page.description}
        path={path("/faq")}
        jsonLd={faqJsonLd(items, locale)}
      />

      <section className="marketing-section" aria-labelledby="faq-hero">
        <div className="marketing-shell" ref={introRef}>
          <div className="marketing-section-head">
            <h1 id="faq-hero">{page.h1}</h1>
            <p>{page.intro}</p>
          </div>
        </div>
      </section>

      <section className="marketing-section" style={{ paddingTop: 0 }} aria-labelledby="faq-list">
        <div className="marketing-shell" ref={faqRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="faq-list">{t.home.faqHeading}</h2>
          </div>
          <MarketingFaq items={items} />
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="faq-cta">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="faq-cta">{t.home.ctaHeading}</h2>
            <p>{t.home.ctaBody}</p>
            <div className="marketing-cta-row">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                {t.shared.contactSales}
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/plans")}>
                {t.shared.viewPlans}
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to={path("/technology")}>
                {t.footer.technology}
              </MagneticButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
