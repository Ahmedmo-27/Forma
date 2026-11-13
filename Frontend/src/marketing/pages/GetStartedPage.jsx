import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchPublicPlans, submitPublicSignup } from "../api";
import { appOrigin, SALES_MAILTO, SALES_EMAIL } from "../host";
import MagneticButton from "../components/MagneticButton";
import MarketingHelmet from "../components/MarketingHelmet";
import { gsap, useGSAP, registerMarketingGsap } from "../gsap/register";

registerMarketingGsap();

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function GetStartedPage() {
  const [params] = useSearchParams();
  const panelRef = useRef(null);
  const { data: catalog } = useQuery({
    queryKey: ["public-plans"],
    queryFn: fetchPublicPlans,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState({
    name: "",
    ownerName: "",
    ownerEmail: "",
    planKey: params.get("plan") || "basic",
    cycle: params.get("cycle") || "monthly",
  });
  const [result, setResult] = useState(null);

  useGSAP(
    () => {
      const panel = panelRef.current;
      if (!panel) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(panel, {
          autoAlpha: 0,
          y: 24,
          duration: 0.7,
          ease: "power3.out",
        });
      });
      return () => mm.revert();
    },
    { scope: panelRef, dependencies: [result], revertOnUpdate: true }
  );

  const planOptions = catalog?.plans || [];
  const cycleOptions = useMemo(() => {
    const cycles = new Set(
      (catalog?.prices || [])
        .filter((p) => p.planKey === form.planKey && !p.isSoldOut)
        .map((p) => p.cycle)
    );
    return ["monthly", "yearly"].filter((c) => cycles.has(c));
  }, [catalog, form.planKey]);

  const mutation = useMutation({
    mutationFn: submitPublicSignup,
    onSuccess: (data) => setResult(data),
  });

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "planKey") {
        const available = (catalog?.prices || [])
          .filter((p) => p.planKey === value && !p.isSoldOut)
          .map((p) => p.cycle);
        if (!available.includes(next.cycle)) {
          next.cycle = available[0] || "monthly";
        }
      }
      return next;
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    setResult(null);
    mutation.mutate({
      name: form.name,
      slug: slugify(form.name),
      ownerName: form.ownerName,
      ownerEmail: form.ownerEmail,
      planKey: form.planKey,
      cycle: form.cycle,
    });
  }

  const errorMessage =
    mutation.error?.response?.data?.message ||
    mutation.error?.response?.data?.error?.message ||
    mutation.error?.message;

  return (
    <>
      <MarketingHelmet
        title="Get started — Forma"
        description="Open a Forma gym workspace: pick a plan, create your trial tenant, and receive bank-transfer instructions with your payment reference."
        path="/get-started"
      />

      <section className="marketing-section" aria-labelledby="start-heading">
        <div className="marketing-shell" ref={panelRef}>
          <div className="marketing-section-head">
            <h1 id="start-heading">Open your gym workspace.</h1>
            <p>
              We create a trial tenant, email the owner invite, and issue a bank-transfer reference.
              Prefer a walkthrough?{" "}
              <a href={SALES_MAILTO} style={{ textDecoration: "underline" }}>
                Email {SALES_EMAIL}
              </a>
              .
            </p>
          </div>

          {result ? (
            <div className="marketing-payment" role="status">
              <h3 style={{ margin: 0, fontSize: "1.2rem", letterSpacing: "-0.02em" }}>
                You&apos;re almost live
              </h3>
              <p style={{ margin: 0, color: "var(--mkt-muted)", lineHeight: 1.55 }}>
                {result.message} Use the reference below in the transfer remarks. After confirmation,
                the owner sets a password from the invite email
                {result.invite?.inviteUrl ? " (or the link shown here in local setups)" : ""}.
              </p>
              <dl>
                <div>
                  <dt>Gym code</dt>
                  <dd>{result.tenant?.slug}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>
                    {result.tenant?.planKey} · {result.payment?.cycle}
                  </dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    {result.payment?.amount} {result.payment?.currency}
                  </dd>
                </div>
                <div>
                  <dt>Payment reference</dt>
                  <dd>{result.payment?.paymentRef}</dd>
                </div>
                <div>
                  <dt>Bank</dt>
                  <dd>{result.payment?.instructions?.bankName}</dd>
                </div>
                <div>
                  <dt>Account name</dt>
                  <dd>{result.payment?.instructions?.accountName}</dd>
                </div>
                <div>
                  <dt>IBAN</dt>
                  <dd>{result.payment?.instructions?.iban}</dd>
                </div>
                {result.payment?.instructions?.swift ? (
                  <div>
                    <dt>SWIFT</dt>
                    <dd>{result.payment.instructions.swift}</dd>
                  </div>
                ) : null}
              </dl>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--mkt-muted)" }}>
                {result.payment?.instructions?.notice}
              </p>
              <div className="marketing-cta-row">
                <a className="marketing-btn marketing-btn-primary" href={SALES_MAILTO}>
                  Contact sales
                </a>
                <a
                  className="marketing-btn marketing-btn-ghost"
                  href={`${appOrigin()}${result.invite?.inviteUrl || "/login"}`}
                >
                  Open invite / login
                </a>
                <Link className="marketing-btn marketing-btn-ghost" to="/plans">
                  Back to plans
                </Link>
              </div>
            </div>
          ) : (
            <form className="marketing-form" onSubmit={onSubmit} noValidate>
              {mutation.isError && (
                <p className="marketing-alert marketing-alert-error" role="alert">
                  {errorMessage || "Signup failed. Try again or contact sales."}
                </p>
              )}

              <div className="marketing-field">
                <label htmlFor="gym-name">Gym name</label>
                <input
                  id="gym-name"
                  name="name"
                  autoComplete="organization"
                  required
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>

              <div className="marketing-field">
                <label htmlFor="owner-name">Owner name</label>
                <input
                  id="owner-name"
                  name="ownerName"
                  autoComplete="name"
                  required
                  value={form.ownerName}
                  onChange={(e) => updateField("ownerName", e.target.value)}
                />
              </div>

              <div className="marketing-field">
                <label htmlFor="owner-email">Owner email</label>
                <input
                  id="owner-email"
                  name="ownerEmail"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.ownerEmail}
                  onChange={(e) => updateField("ownerEmail", e.target.value)}
                />
              </div>

              <div className="marketing-field">
                <label htmlFor="plan-key">Plan</label>
                <select
                  id="plan-key"
                  name="planKey"
                  value={form.planKey}
                  onChange={(e) => updateField("planKey", e.target.value)}
                >
                  {(planOptions.length ? planOptions : [{ key: "basic", name: "Basic" }]).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="marketing-field">
                <label htmlFor="cycle">Billing cycle</label>
                <select
                  id="cycle"
                  name="cycle"
                  value={form.cycle}
                  onChange={(e) => updateField("cycle", e.target.value)}
                >
                  {(cycleOptions.length ? cycleOptions : ["monthly", "yearly"]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="marketing-cta-row">
                <button
                  type="submit"
                  className="marketing-btn marketing-btn-primary"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Submitting…" : "Create workspace"}
                </button>
                <MagneticButton className="marketing-btn marketing-btn-ghost" href={SALES_MAILTO}>
                  Contact sales instead
                </MagneticButton>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
