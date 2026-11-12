import { lazy, Suspense, useRef } from "react";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingFaq from "../components/MarketingFaq";
import MarketingHelmet from "../components/MarketingHelmet";
import { homeJsonLd } from "../seo";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useBatchReveal } from "../hooks/useBatchReveal";
import { useScrubProgress } from "../hooks/useScrubProgress";
import { useRowNudge } from "../hooks/useRowNudge";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

const HeroGymAccent = lazy(() => import("../components/HeroGymAccent"));

const FAQ_ITEMS = [
  {
    q: "How does onboarding work?",
    a: "Talk to sales about your branches and roles, pick Basic, Gold, or Platinum, then pay by bank transfer with the reference we issue. Once funds clear, your owner invite is active and your team can log in.",
  },
  {
    q: "How is Forma different from other gym systems?",
    a: "Many “gym management” products are skins on ready-made ERP templates sold across industries. Forma is a modern platform built for gyms — not a rebadged multi-industry ERP — so your floor workflows, risk surface, and roadmap are not tied to restaurant or warehouse modules.",
  },
  {
    q: "Why bank transfer instead of a card checkout?",
    a: "Forma is built for operators who prefer a guided launch and clear payment references — not a lonely self-serve funnel. Wire transfer keeps billing deliberate and tied to your workspace activation.",
  },
  {
    q: "What is the difference between Basic, Gold, and Platinum?",
    a: "Basic covers members, packages, check-in, and PT tracking for a single location. Gold adds sales CRM, WhatsApp follow-ups, accounting, and import tools. Platinum unlocks executive analytics and business intelligence for multi-location operators.",
  },
  {
    q: "Can Forma run more than one branch?",
    a: "Yes. Plans scale with your footprint — from one branch on Basic up through Gold and Platinum for growing multi-location operators. Sales can help you choose the right ceiling for members and staff.",
  },
  {
    q: "Where do staff log in?",
    a: "This site is for plans and signup. Day-to-day staff access lives on the Forma app host. After your workspace is live, your team signs in there with the roles you assign.",
  },
  {
    q: "What happens after payment clears?",
    a: "Your gym workspace opens, the owner invite is ready, and reception, sales, coaches, and managers can start working under role-aware access — members, check-ins, and billing in one place.",
  },
];

export default function HomePage() {
  const pageRef = useRef(null);
  const heroRef = useRef(null);

  const painRef = useScrollReveal({
    stagger: 0.09,
    from: { x: -24, y: 16 },
  });
  const howRef = useScrubProgress();
  const builtHeadRef = useScrollReveal({ self: true, y: 24 });
  const builtBatchRef = useBatchReveal({ y: 32, stagger: 0.07 });
  const whyRef = useScrollReveal({
    stagger: 0.09,
    from: { x: 28, y: 18 },
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

  return (
    <div ref={setPageRef}>
      <MarketingHelmet
        title="Forma — Run your gym with clarity"
        description="Forma is the gym operating system for members, check-ins, sales, coaching, and billing — sales-assisted onboarding with bank transfer."
        path="/"
        jsonLd={homeJsonLd()}
      />

      <section className="marketing-hero" aria-labelledby="hero-heading" ref={heroRef}>
        <div className="marketing-hero-slash" aria-hidden="true" />
        <div className="marketing-shell">
          <div className="marketing-hero-stage">
            <div className="marketing-hero-panel">
              <img src="/forma-horizontal.jpeg" alt="forma" className="marketing-hero-brand" />
              <h1 id="hero-heading">The operating system for serious gyms.</h1>
              <p className="marketing-hero-copy">
                One workspace for members, staff, check-ins, and billing — launched with sales, paid
                by bank transfer.
              </p>
              <div className="marketing-cta-row">
                <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                  Contact sales
                </MagneticButton>
                <MagneticButton className="marketing-btn marketing-btn-ghost" to="/plans">
                  View plans
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
            <h2 id="pain-heading">Gym ops break when the tools do not fit the floor.</h2>
            <p>
              Spreadsheets, chat threads, and generic software leave reception, sales, and owners
              guessing — while members wait at the desk.
            </p>
          </div>
          <ul className="marketing-pain-list">
            <li className="mkt-reveal mkt-nudge">
              Memberships and freezes live in files nobody trusts at peak hour.
            </li>
            <li className="mkt-reveal mkt-nudge">
              Follow-ups die in personal WhatsApp threads instead of a shared pipeline.
            </li>
            <li className="mkt-reveal mkt-nudge">
              Coaches and front desk juggle separate tools with no shared member truth.
            </li>
            <li className="mkt-reveal mkt-nudge">
              Owners lack a clear view of sales, attendance, and billing across branches.
            </li>
            <li className="mkt-reveal mkt-nudge">
              Self-serve SaaS dumps you into a dashboard with no launch partner.
            </li>
          </ul>
        </div>
      </section>

      <section
        className="marketing-section marketing-atmosphere marketing-atmosphere-reception"
        aria-labelledby="how-heading"
      >
        <div className="marketing-shell" ref={howRef}>
          <div className="marketing-section-head">
            <h2 id="how-heading">Sales-assisted, not self-serve chaos.</h2>
            <p>
              Forma is built for operators who want a guided launch — not a credit-card funnel and a
              lonely inbox.
            </p>
          </div>
          <div className="marketing-steps-progress" aria-hidden="true">
            <div className="marketing-steps-progress-fill" />
          </div>
          <ol className="marketing-steps">
            <li className="marketing-step">
              <h3>Talk to sales</h3>
              <p>
                Tell us about your branches, staff roles, and how you sell memberships today — we
                map Forma to how you already run the floor.
              </p>
            </li>
            <li className="marketing-step">
              <h3>Pick a plan</h3>
              <p>Choose Basic, Gold, or Platinum. We open your gym workspace and owner invite.</p>
            </li>
            <li className="marketing-step">
              <h3>Wire transfer</h3>
              <p>
                Pay with the reference we issue. Once funds clear, your team is live on Forma.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ paddingTop: 0 }}
        aria-labelledby="built-heading"
      >
        <div className="marketing-shell">
          <div className="marketing-section-head" ref={builtHeadRef}>
            <h2 id="built-heading">Built for the floor and the back office.</h2>
            <p>
              One workspace for reception, sales, coaches, and owners — with role-aware access and
              the capabilities serious gyms actually need.
            </p>
          </div>
          <div className="marketing-feature-list" ref={builtBatchRef}>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Members & check-in</h3>
              <p>Profiles, packages, freezes, and QR check-in that keep the front desk moving.</p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Sales pipeline</h3>
              <p>
                CRM, funnels, targets, and WhatsApp-ready follow-ups for teams that close on the
                floor.
              </p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Coaching & PT</h3>
              <p>
                Assign coaches, track PT, and keep staff work visible without bolting on another
                app.
              </p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Accounting & approvals</h3>
              <p>
                Gym-aware accounting plus exception approvals so money and policy stay under
                control.
              </p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Excel import</h3>
              <p>Bring existing member data in cleanly — migrate without starting from zero.</p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Roles & owner controls</h3>
              <p>Branding, roles, and billing status — your gym, your rules, under one plan.</p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Analytics & BI</h3>
              <p>
                Executive analytics and business intelligence on Platinum for operators who need
                the full picture.
              </p>
            </div>
            <div className="marketing-feature-row mkt-batch mkt-nudge">
              <h3>Multi-branch growth</h3>
              <p>
                Plans scale from a single location to multi-branch ceilings for members, staff, and
                sites.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ paddingTop: 0 }}
        aria-labelledby="why-heading"
      >
        <div className="marketing-shell" ref={whyRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="why-heading">Why Forma — not another generic system.</h2>
            <p>
              Built for gym operators, not bolted together from a CRM, a POS, and a spreadsheet.
            </p>
          </div>
          <div className="marketing-why-list">
            <div className="marketing-why-row mkt-reveal mkt-nudge">
              <h3>Gym-native ops</h3>
              <p>
                Memberships, check-in, packages, and coaching workflows — designed for the floor,
                not a generic pipeline.
              </p>
            </div>
            <div className="marketing-why-row mkt-reveal mkt-nudge">
              <h3>Floor + back office</h3>
              <p>
                Reception, sales, coaches, and owners share one workspace instead of three
                disconnected tools.
              </p>
            </div>
            <div className="marketing-why-row mkt-reveal mkt-nudge">
              <h3>Role-aware access</h3>
              <p>
                Staff see what their job needs. Owners keep branding, roles, and billing under
                control.
              </p>
            </div>
            <div className="marketing-why-row mkt-reveal mkt-nudge">
              <h3>Guided launch</h3>
              <p>
                Sales-assisted onboarding and bank transfer — deliberate activation for regional
                operators.
              </p>
            </div>
            <div className="marketing-why-row mkt-reveal mkt-nudge">
              <h3>Plans that grow with you</h3>
              <p>
                Move from Basic to Gold to Platinum as members, staff, and branches grow — without
                duct-taping another stack.
              </p>
            </div>
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
            <h2 id="compare-teaser-heading">Built for gyms — not borrowed from an ERP template.</h2>
            <p>
              Most “gym management” products are skins on ready-made ERP platforms. A shared
              template flaw can ripple across every vertical on that platform — including yours.
              See how Forma differs on blast radius, data boundaries, downtime, and floor fit.
            </p>
          </div>
          <div className="marketing-cta-row">
            <MagneticButton className="marketing-btn marketing-btn-primary" to="/why-forma">
              Why Forma?
            </MagneticButton>
            <MagneticButton className="marketing-btn marketing-btn-ghost" to="/plans">
              View plans
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
            <h2 id="roles-heading">Built for every seat on the floor.</h2>
            <p>Clear day-to-day value for the people who actually run your gym.</p>
          </div>
          <div className="marketing-roles">
            <div className="marketing-role mkt-reveal mkt-nudge">
              <h3>Owners</h3>
              <p>
                Branding, roles, billing status, and — on higher plans — analytics that show how
                the business is performing.
              </p>
            </div>
            <div className="marketing-role mkt-reveal mkt-nudge">
              <h3>Reception</h3>
              <p>
                Fast member lookup, packages, freezes, and QR check-in so the desk never stalls at
                rush hour.
              </p>
            </div>
            <div className="marketing-role mkt-reveal mkt-nudge">
              <h3>Sales</h3>
              <p>
                Shared pipeline, funnels, and WhatsApp-ready follow-ups — so leads do not die in
                personal chats.
              </p>
            </div>
            <div className="marketing-role mkt-reveal mkt-nudge">
              <h3>Coaches</h3>
              <p>
                PT tracking and assignments in the same workspace as members — less hunting across
                tools.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="marketing-section"
        style={{ paddingTop: 0 }}
        aria-labelledby="faq-heading"
      >
        <div className="marketing-shell" ref={faqRef}>
          <div className="marketing-section-head mkt-reveal">
            <h2 id="faq-heading">Questions operators ask first.</h2>
            <p>
              Straight answers on how Forma differs from template ERP gym tools, launch, payment,
              and where your team works day to day.
            </p>
          </div>
          <MarketingFaq items={FAQ_ITEMS} />
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="cta-heading">
        <div className="marketing-shell">
          <div className="marketing-band-inner" ref={bandRef}>
            <h2 id="cta-heading">Ready when your next location is.</h2>
            <p>
              Email sales to start, or open a workspace yourself and complete payment with the bank
              reference we generate.
            </p>
            <div className="marketing-cta-row">
              <MagneticButton className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                Contact sales
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
