import { useRef } from "react";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingHelmet from "../components/MarketingHelmet";
import { COMPARE_ROWS } from "../data/compareRows";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useRowNudge } from "../hooks/useRowNudge";
import { registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

const WHY_POINTS = [
  {
    title: "Gym-native ops",
    body: "Memberships, check-in, packages, and coaching workflows — designed for the floor, not a generic pipeline.",
  },
  {
    title: "Floor + back office",
    body: "Reception, sales, coaches, and owners share one workspace instead of three disconnected tools.",
  },
  {
    title: "Role-aware access",
    body: "Staff see what their job needs. Owners keep branding, roles, and billing under control.",
  },
  {
    title: "Guided launch",
    body: "Sales-assisted onboarding and bank transfer — deliberate activation for regional operators.",
  },
  {
    title: "Plans that grow with you",
    body: "Move from Basic to Gold to Platinum as members, staff, and branches grow — without duct-taping another stack.",
  },
];

export default function WhyFormaPage() {
  const pageRef = useRef(null);
  const introRef = useScrollReveal({ self: true, y: 28 });
  const whyRef = useScrollReveal({
    stagger: 0.09,
    from: { x: 28, y: 18 },
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
      <MarketingHelmet
        title="Why Forma? — Gym OS, not a template ERP"
        description="Forma is a modern platform built for gyms — not a rebadged multi-industry ERP template. See how blast radius, data boundaries, downtime, and floor fit differ."
        path="/why-forma"
      />

      <section className="marketing-section" aria-labelledby="why-forma-hero">
        <div className="marketing-shell" ref={introRef}>
          <div className="marketing-section-head">
            <h1 id="why-forma-hero">Why Forma?</h1>
            <p>
              Most “gym management” products are skins on ready-made ERP platforms sold to many
              industries. Forma is a modern platform built for gyms — so your risk surface, roadmap,
              and day-to-day tools are not borrowed from restaurants or warehouses.
            </p>
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
            <h2 id="why-points-heading">What operators get with Forma.</h2>
            <p>Built for gym operators, not bolted together from a CRM, a POS, and a spreadsheet.</p>
          </div>
          <div className="marketing-why-list">
            {WHY_POINTS.map((point) => (
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
            <h2 id="compare-heading">Built for gyms — not borrowed from an ERP template.</h2>
            <p>
              A flaw, outage, or data-boundary issue in a shared multi-industry template can ripple
              across every business on it — including yours. Here is the category difference.
            </p>
          </div>

          <div
            className="marketing-compare mkt-reveal"
            role="table"
            aria-label="Forma versus template ERP gym tools"
          >
            <div className="marketing-compare-head" role="row">
              <div className="marketing-compare-theme" role="columnheader">
                Theme
              </div>
              <div className="marketing-compare-them" role="columnheader">
                Template ERP gym tools
              </div>
              <div className="marketing-compare-forma" role="columnheader">
                Forma
              </div>
            </div>
            {COMPARE_ROWS.map((row) => (
              <div className="marketing-compare-row mkt-reveal mkt-nudge" role="row" key={row.theme}>
                <div className="marketing-compare-theme" role="rowheader">
                  {row.theme}
                </div>
                <div className="marketing-compare-them" role="cell" data-label="Template ERP">
                  <span className="marketing-compare-label">Template ERP</span>
                  <p>{row.them}</p>
                </div>
                <div className="marketing-compare-forma" role="cell" data-label="Forma">
                  <span className="marketing-compare-label">Forma</span>
                  <p>{row.forma}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="marketing-compare-foot mkt-reveal">
            Choose a modern platform built for gyms — not a rebadged multi-industry ERP template.
          </p>
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="why-cta-heading">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="why-cta-heading">See plans, or talk to sales.</h2>
            <p>
              Pick Basic, Gold, or Platinum — or email sales for a guided launch and bank-transfer
              activation.
            </p>
            <div className="marketing-cta-row">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                Contact sales
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to="/plans">
                View plans
              </MagneticButton>
              <MagneticButton className="marketing-btn marketing-btn-ghost" to="/get-started">
                Get started
              </MagneticButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
