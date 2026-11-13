import "../styles/marketing.css";

function isArabicPath() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return path === "/ar" || path.startsWith("/ar/");
}

function loadingLabel() {
  return isArabicPath() ? "جارٍ التحميل" : "Loading";
}

function localeProps() {
  return isArabicPath() ? { lang: "ar", dir: "rtl" } : { lang: "en", dir: "ltr" };
}

function Status() {
  return <span className="mkt-sr">{loadingLabel()}</span>;
}

function Bone({ className = "", width, height }) {
  return (
    <span
      className={`mkt-bone ${className}`.trim()}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

function SectionHead() {
  return (
    <div className="marketing-section-head" aria-hidden="true">
      <Bone className="mkt-bone-on-panel mkt-bone-title" width="46%" height="2.4rem" />
      <Bone className="mkt-bone-on-panel" width="72%" height="1rem" />
      <Bone className="mkt-bone-on-panel" width="58%" height="1rem" />
    </div>
  );
}

function FieldBone() {
  return (
    <div className="mkt-loader-field" aria-hidden="true">
      <Bone className="mkt-bone-on-panel" width="7.5rem" height="0.8rem" />
      <Bone className="mkt-bone-on-panel mkt-bone-field" width="100%" height="44px" />
    </div>
  );
}

function PlanCards() {
  return (
    <>
      <div className="mkt-loader-pills" aria-hidden="true">
        <Bone className="mkt-bone-on-panel" width="5.5rem" height="2rem" />
        <Bone className="mkt-bone-on-panel" width="6.5rem" height="2rem" />
        <Bone className="mkt-bone-on-panel" width="5rem" height="2rem" />
      </div>
      <div className="marketing-plan-grid" aria-hidden="true">
        {[0, 1, 2].map((key) => (
          <article className="marketing-plan" key={key}>
            <Bone className="mkt-bone-on-panel" width="55%" height="1.45rem" />
            <Bone className="mkt-bone-on-panel" width="88%" height="0.9rem" />
            <Bone className="mkt-bone-on-panel" width="40%" height="1.8rem" />
            <Bone className="mkt-bone-on-panel mkt-bone-btn" width="100%" height="44px" />
          </article>
        ))}
      </div>
    </>
  );
}

export function MarketingBootScreen() {
  return (
    <div className="marketing-root marketing-boot" role="status" aria-busy="true" {...localeProps()}>
      <Status />
      <div className="marketing-boot-mark" aria-hidden="true">
        <Bone className="marketing-boot-word" width="9rem" height="1.35rem" />
      </div>
    </div>
  );
}

export function MarketingPlansSkeleton({ framed = true }) {
  const body = (
    <>
      {framed ? <SectionHead /> : null}
      <PlanCards />
    </>
  );

  if (!framed) {
    return (
      <div className="mkt-loader" role="status" aria-busy="true" {...localeProps()}>
        <Status />
        {body}
      </div>
    );
  }

  return (
    <section className="marketing-section">
      <div className="marketing-shell">{body}</div>
    </section>
  );
}

export function MarketingFormSelectsSkeleton() {
  return (
    <div className="mkt-loader-fields" role="status" aria-busy="true" {...localeProps()}>
      <Status />
      <FieldBone />
      <FieldBone />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <>
      <section className="marketing-hero" aria-hidden="true">
        <div className="marketing-shell">
          <div className="marketing-hero-stage">
            <div className="marketing-hero-panel">
              <Bone className="mkt-bone-on-panel" width="42%" height="1.75rem" />
              <Bone className="mkt-bone-on-panel" width="90%" height="2.6rem" />
              <Bone className="mkt-bone-on-panel" width="78%" height="1rem" />
              <Bone className="mkt-bone-on-panel" width="64%" height="1rem" />
              <div className="mkt-loader-actions">
                <Bone className="mkt-bone-on-panel mkt-bone-btn" width="9rem" height="44px" />
                <Bone className="mkt-bone-on-panel mkt-bone-btn" width="9rem" height="44px" />
              </div>
            </div>
            <div className="marketing-hero-3d">
              <div className="marketing-hero-3d-fallback">
                <span className="marketing-hero-3d-disc" />
              </div>
            </div>
          </div>
        </div>
      </section>
      {[0, 1, 2].map((section) => (
        <section className="marketing-section" key={section} aria-hidden="true" style={{ paddingTop: section ? 0 : undefined }}>
          <div className="marketing-shell">
            <SectionHead />
            <div className="mkt-loader-rows">
              {[0, 1, 2].map((row) => (
                <Bone
                  key={row}
                  className="mkt-bone-on-panel"
                  width={row === 2 ? "70%" : "100%"}
                  height="3.25rem"
                />
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

function FormSkeleton() {
  return (
    <section className="marketing-section">
      <div className="marketing-shell">
        <SectionHead />
        <div className="marketing-form" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((field) => (
            <FieldBone key={field} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ArticleSkeleton() {
  return (
    <>
      <section className="marketing-section">
        <div className="marketing-shell">
          <SectionHead />
          <div className="mkt-loader-rows" aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <Bone
                key={row}
                className="mkt-bone-on-panel"
                width={row === 3 ? "62%" : "100%"}
                height="4.5rem"
              />
            ))}
          </div>
        </div>
      </section>
      <section className="marketing-band" aria-hidden="true">
        <div className="marketing-shell">
          <div className="marketing-band-inner">
            <Bone className="mkt-bone-on-panel" width="58%" height="2rem" />
            <Bone className="mkt-bone-on-panel" width="86%" height="1rem" />
            <div className="mkt-loader-actions">
              <Bone className="mkt-bone-on-panel mkt-bone-btn" width="9rem" height="44px" />
              <Bone className="mkt-bone-on-panel mkt-bone-btn" width="8rem" height="44px" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const VARIANTS = {
  home: HomeSkeleton,
  plans: () => <MarketingPlansSkeleton framed />,
  form: FormSkeleton,
  article: ArticleSkeleton,
};

export function MarketingPageSkeleton({ variant = "article" }) {
  const Shape = VARIANTS[variant] || ArticleSkeleton;
  return (
    <div className="mkt-loader" role="status" aria-busy="true" {...localeProps()}>
      <Status />
      <Shape />
    </div>
  );
}
