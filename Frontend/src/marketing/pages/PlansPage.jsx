import { useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicPlans } from "../api";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingHelmet from "../components/MarketingHelmet";
import { labelFeature } from "../data/featureLabels";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

const CYCLES = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
  { id: "lifetime", label: "Lifetime" },
];

const PLANS_DESCRIPTION =
  "Compare Forma Basic, Gold, and Platinum plans in EGP — monthly, yearly, or lifetime. Sales-assisted onboarding with bank transfer.";

function formatAmount(amount, currency = "EGP") {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function yearlySavingsPercent(prices, planKey) {
  const monthly = prices.find(
    (p) => p.planKey === planKey && p.cycle === "monthly" && !p.isSoldOut
  );
  const yearly = prices.find(
    (p) => p.planKey === planKey && p.cycle === "yearly" && !p.isSoldOut
  );
  if (!monthly?.amount || !yearly?.amount) return null;
  const fullYear = monthly.amount * 12;
  if (fullYear <= yearly.amount) return null;
  return Math.round((1 - yearly.amount / fullYear) * 100);
}

export default function PlansPage() {
  const [cycle, setCycle] = useState("monthly");
  const sectionRef = useRef(null);
  const gridRef = useRef(null);
  const panelId = useId();
  const headRevealRef = useScrollReveal({ self: true, y: 24 });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public-plans"],
    queryFn: fetchPublicPlans,
    staleTime: 5 * 60 * 1000,
  });

  const prices = data?.prices || [];

  const plansWithPrice = useMemo(() => {
    const plans = data?.plans || [];
    return plans.map((plan) => {
      const price =
        prices.find((p) => p.planKey === plan.key && p.cycle === cycle && !p.isSoldOut) ||
        prices.find((p) => p.planKey === plan.key && p.cycle === cycle);
      const savePct = yearlySavingsPercent(prices, plan.key);
      return { ...plan, price, savePct };
    });
  }, [data, cycle, prices]);

  const maxYearlySave = useMemo(() => {
    let max = 0;
    for (const plan of data?.plans || []) {
      const pct = yearlySavingsPercent(prices, plan.key);
      if (pct != null && pct > max) max = pct;
    }
    return max;
  }, [data, prices]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const tabs = section.querySelector(".marketing-cycle-tabs");

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(tabs, { autoAlpha: 1, y: 0 });
      });
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(tabs, {
          autoAlpha: 0,
          y: 18,
          duration: 0.55,
          delay: 0.08,
          ease: "power3.out",
        });
      });
      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid || isLoading || isError) return;
      const cards = grid.querySelectorAll(".marketing-plan");
      if (!cards.length) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(cards, { autoAlpha: 1, y: 0, scale: 1 });
      });
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          cards,
          { autoAlpha: 0, y: 28, scale: 0.97 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.55,
            stagger: 0.09,
            ease: "power3.out",
            overwrite: true,
          }
        );
      });
      return () => mm.revert();
    },
    { scope: gridRef, dependencies: [plansWithPrice, cycle, isLoading, isError], revertOnUpdate: true }
  );

  return (
    <>
      <MarketingHelmet
        title="Plans — Forma"
        description={PLANS_DESCRIPTION}
        path="/plans"
      />

      <section className="marketing-section" aria-labelledby="plans-heading" ref={sectionRef}>
        <div className="marketing-shell">
          <div className="marketing-section-head" ref={headRevealRef}>
            <h1 id="plans-heading">Plans that scale with your floor.</h1>
            <p>
              All prices in {data?.currency || "EGP"}. Prefer a guided rollout?{" "}
              <a href={SALES_MAILTO} style={{ textDecoration: "underline" }}>
                Contact sales
              </a>
              .
            </p>
          </div>

          <div className="marketing-cycle-tabs" role="tablist" aria-label="Billing cycle">
            {CYCLES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                id={`cycle-tab-${c.id}`}
                aria-selected={cycle === c.id}
                aria-controls={panelId}
                tabIndex={cycle === c.id ? 0 : -1}
                onClick={() => setCycle(c.id)}
              >
                {c.label}
                {c.id === "yearly" && maxYearlySave > 0 ? (
                  <span className="marketing-cycle-save">Save up to {maxYearlySave}%</span>
                ) : null}
              </button>
            ))}
          </div>

          {isLoading && <p className="marketing-alert">Loading plans…</p>}
          {isError && (
            <p className="marketing-alert marketing-alert-error" role="alert">
              {error?.response?.data?.message || error?.message || "Could not load plans."}
            </p>
          )}

          {!isLoading && !isError && (
            <div
              className="marketing-plan-grid"
              ref={gridRef}
              id={panelId}
              role="tabpanel"
              aria-labelledby={`cycle-tab-${cycle}`}
            >
              {plansWithPrice.map((plan) => {
                const featured = plan.key === "gold";
                const soldOut = plan.price?.isSoldOut;
                const unavailable = soldOut || !plan.price;
                const showSave = cycle === "yearly" && plan.savePct != null && plan.savePct > 0;
                return (
                  <article
                    key={`${plan.key}-${cycle}`}
                    className={`marketing-plan${featured ? " is-featured" : ""}`}
                  >
                    <div>
                      <div className="marketing-plan-title-row">
                        <h2>{plan.name}</h2>
                        {showSave ? (
                          <span className="marketing-plan-save">Save {plan.savePct}%</span>
                        ) : null}
                      </div>
                      <p className="marketing-plan-desc">
                        {plan.description ||
                          (plan.features?.length
                            ? `${plan.features.length} capabilities included`
                            : "Core Forma workspace")}
                      </p>
                    </div>
                    <div className="marketing-price">
                      <strong>
                        {soldOut ? "Sold out" : formatAmount(plan.price?.amount, data?.currency)}
                      </strong>
                      {!soldOut && plan.price && (
                        <span>
                          / {cycle}
                          {plan.price.remainingSeats != null
                            ? ` · ${plan.price.remainingSeats} seats left`
                            : ""}
                        </span>
                      )}
                    </div>
                    <ul className="marketing-feature-bullets">
                      {(plan.features || []).slice(0, 8).map((f) => (
                        <li key={f}>{labelFeature(f)}</li>
                      ))}
                      {plan.limits?.maxMembers != null && (
                        <li>Up to {plan.limits.maxMembers} members</li>
                      )}
                      {plan.limits?.maxStaff != null && (
                        <li>Up to {plan.limits.maxStaff} staff</li>
                      )}
                    </ul>
                    {unavailable ? (
                      <span
                        className="marketing-btn marketing-btn-primary"
                        style={{ opacity: 0.55, pointerEvents: "none" }}
                        aria-disabled="true"
                      >
                        Unavailable
                      </span>
                    ) : (
                      <MagneticButton
                        className="marketing-btn marketing-btn-primary"
                        to={`/get-started?plan=${encodeURIComponent(plan.key)}&cycle=${encodeURIComponent(cycle)}`}
                      >
                        Get started
                      </MagneticButton>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
