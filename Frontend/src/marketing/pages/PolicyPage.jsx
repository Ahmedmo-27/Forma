import { Link } from "react-router-dom";
import MarketingHelmet from "../components/MarketingHelmet";
import { useMarketingI18n } from "../i18n";

const PATHS = {
  privacy: "/privacy",
  terms: "/terms",
  refunds: "/refunds",
};

const RELATED = {
  privacy: ["terms", "refunds"],
  terms: ["privacy", "refunds"],
  refunds: ["terms", "privacy"],
};

export default function PolicyPage({ policyKey }) {
  const { t, path } = useMarketingI18n();
  const page = t.policies[policyKey];
  const barePath = PATHS[policyKey];
  const related = RELATED[policyKey] || [];

  return (
    <>
      <MarketingHelmet title={page.title} description={page.description} path={path(barePath)} />

      <section className="marketing-section" aria-labelledby="policy-title">
        <div className="marketing-shell marketing-policy">
          <header className="marketing-section-head">
            <h1 id="policy-title">{page.h1}</h1>
            <p className="marketing-policy-updated">
              {page.updatedLabel} {page.updated}
            </p>
            <p>{page.intro}</p>
          </header>

          {page.sections.map((section, index) => {
            const headingId = `policy-section-${index}`;
            return (
              <section key={section.heading} className="marketing-policy-section" aria-labelledby={headingId}>
                <h2 id={headingId}>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.table ? (
                  <div className="marketing-policy-table-wrap">
                    <table className="marketing-policy-table">
                      <caption>{section.table.caption}</caption>
                      <thead>
                        <tr>
                          {section.table.headers.map((header) => (
                            <th key={header} scope="col">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row) => (
                          <tr key={row[0]}>
                            {row.map((cell, cellIndex) => (
                              <td key={`${row[0]}-${cellIndex}`}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {section.links?.map((link) => (
                  <p key={link.to}>
                    <Link to={path(link.to)}>{link.label}</Link>
                  </p>
                ))}
              </section>
            );
          })}

          <nav className="marketing-policy-related" aria-label={t.policies.related}>
            {related.map((key) => (
              <Link key={key} to={path(PATHS[key])}>
                {t.footer[key]}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </>
  );
}
