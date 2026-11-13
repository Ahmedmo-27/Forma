import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicPlans } from "../api";
import { SALES_MAILTO } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingHelmet from "../components/MarketingHelmet";
import { labelFeature } from "../data/featureLabels";
import {
  buildDurationOptions,
  durationKey,
  durationSavingsPercent,
  formatDurationLabel,
  normalizeIntervalCount,
} from "../duration";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

const PLANS_DESCRIPTION =
  "Compare Forma Basic, Gold, and Platinum plans in EGP — choose any available month or year duration. Sales-assisted onboarding with bank transfer.";

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

function matchPrice(prices, planKey, cycle, intervalCount) {
  const count = normalizeIntervalCount(intervalCount);
  return (
    prices.find(
      (p) =>
        p.planKey === planKey &&
        p.cycle === cycle &&
        normalizeIntervalCount(p.intervalCount) === count &&
        !p.isSoldOut
    ) ||
    prices.find(
      (p) =>
        p.planKey === planKey &&
        p.cycle === cycle &&
        normalizeIntervalCount(p.intervalCount) === count
    )
  );
}

export default function PlansPage() {
  const [selectedDuration, setSelectedDuration] = useState(null);
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
  const durationOptions = useMemo(() => buildDurationOptions(prices), [prices]);

  useEffect(() => {
    if (!durationOptions.length) {
      setSelectedDuration(null);
      return;
    }
    setSelectedDuration((prev) => {
      if (prev && durationOptions.some((d) => d.id === prev.id)) return prev;
      return durationOptions[0];
    });
  }, [durationOptions]);

  const cycle = selectedDuration?.cycle || "monthly";
  const intervalCount = selectedDuration?.intervalCount || 1;
  const durationId = selectedDuration?.id || durationKey(cycle, intervalCount);

  const plansWithPrice = useMemo(() => {
    const plans = data?.plans || [];
    return plans.map((plan) => {
      const price = matchPrice(prices, plan.key, cycle, intervalCount);
      const savePct = durationSavingsPercent(prices, plan.key, cycle, intervalCount);
      return { ...plan, price, savePct };
    });
  }, [data, cycle, intervalCount, prices]);

  const maxDurationSave = useMemo(() => {
    if (!selectedDuration || selectedDuration.months <= 1) return 0;
    let max = 0;
    for (const plan of data?.plans || []) {
      const pct = durationSavingsPercent(
        prices,
        plan.key,
        selectedDuration.cycle,
        selectedDuration.intervalCount
      );
      if (pct != null && pct > max) max = pct;
    }
    return max;
  }, [data, prices, selectedDuration]);

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
    {
      scope: gridRef,
      dependencies: [plansWithPrice, durationId, isLoading, isError],
      revertOnUpdate: true,
    }
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

          {durationOptions.length > 0 && (
            <div className="marketing-cycle-tabs" role="tablist" aria-label="Plan duration">
              {durationOptions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  id={`cycle-tab-${d.id}`}
                  aria-selected={durationId === d.id}
                  aria-controls={panelId}
                  tabIndex={durationId === d.id ? 0 : -1}
                  onClick={() => setSelectedDuration(d)}
                >
                  {d.label}
                  {d.months > 1 && maxDurationSave > 0 && durationId === d.id ? (
                    <span className="marketing-cycle-save">Save up to {maxDurationSave}%</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

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
              aria-labelledby={`cycle-tab-${durationId}`}
            >
              {plansWithPrice.map((plan) => {
                const featured = plan.key === "gold";
                const soldOut = plan.price?.isSoldOut;
                const unavailable = soldOut || !plan.price;
                const showSave = plan.savePct != null && plan.savePct > 0;
                const label = formatDurationLabel(cycle, intervalCount);
                return (
                  <article
                    key={`${plan.key}-${durationId}`}
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
                          / {label}
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
                        to={`/get-started?plan=${encodeURIComponent(plan.key)}&cycle=${encodeURIComponent(cycle)}&intervalCount=${encodeURIComponent(intervalCount)}`}
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
