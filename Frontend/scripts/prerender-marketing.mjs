/**
 * After `vite build`, write static HTML shells for marketing routes so crawlers
 * see titles, descriptions, canonical, hreflang, OG, JSON-LD, and an article
 * of the same copy without executing JS. The app hides #seo-prerender after paint.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const ORIGIN = "https://www.forma-official.com";

const { MARKETING_PATHS, localizedPath } = await import(
  pathToFileURL(path.join(root, "src/marketing/i18n/locales.js")).href
);
const { faqCorpus } = await import(
  pathToFileURL(path.join(root, "src/marketing/faqCorpus.js")).href
);
const { default: en } = await import(pathToFileURL(path.join(root, "src/marketing/i18n/en.js")).href);
const { default: ar } = await import(pathToFileURL(path.join(root, "src/marketing/i18n/ar.js")).href);

const catalogs = { en, ar };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageCopy(locale, barePath) {
  const t = catalogs[locale];
  const map = {
    "/": t.home,
    "/why-forma": t.why,
    "/plans": t.plans,
    "/get-started": t.getStarted,
    "/gym-management-software-egypt": t.solutions.egypt,
    "/whatsapp-gym-crm": t.solutions.whatsapp,
    "/multi-branch-gym-software": t.solutions.multiBranch,
    "/technology": t.technology,
    "/faq": t.faqPage,
    "/privacy": t.policies.privacy,
    "/terms": t.policies.terms,
    "/refunds": t.policies.refunds,
  };
  return map[barePath] || t.home;
}

function introText(copy) {
  return copy.intro || copy.heroCopy || copy.description || "";
}

function faqItems(locale, barePath) {
  const t = catalogs[locale];
  if (barePath === "/faq") return faqCorpus(t);
  const copy = pageCopy(locale, barePath);
  return Array.isArray(copy?.faq) ? copy.faq : [];
}

function tableHtml(table) {
  if (!table?.headers?.length || !table.rows?.length) return "";
  const caption = table.caption ? `<caption>${escapeHtml(table.caption)}</caption>` : "";
  const head = `<thead><tr>${table.headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead>`;
  const body = `<tbody>${table.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
    )
    .join("")}</tbody>`;
  return `<table>${caption}${head}${body}</table>`;
}

function policySectionsHtml(copy) {
  if (!Array.isArray(copy.sections)) return "";
  return copy.sections
    .map((section) => {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const paragraphs = (section.paragraphs || [])
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");
      return `${heading}${paragraphs}${tableHtml(section.table)}`;
    })
    .join("");
}

function titledList(items) {
  if (!Array.isArray(items) || !items.length || !items[0]?.title) return "";
  return `<ul>${items
    .map(
      (item) =>
        `<li><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body || "")}</p></li>`
    )
    .join("")}</ul>`;
}

function absolute(pathname) {
  return `${ORIGIN}${pathname === "/" ? "/" : pathname}`;
}

function buildJsonLd(locale, barePath, copy) {
  const faqs = faqItems(locale, barePath);
  const graph = [
    {
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      name: "Forma",
      url: ORIGIN,
      email: "sales@forma-official.com",
      logo: `${ORIGIN}/forma-horizontal.jpeg`,
      areaServed: { "@type": "Country", name: "Egypt" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${ORIGIN}/#software`,
      name: "Forma",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      browserRequirements: catalogs[locale].meta.browserRequirements,
      url: absolute(localizedPath("/", locale)),
      description: catalogs[locale].meta.defaultDescription,
      featureList: (catalogs[locale].home.features || []).map((feature) =>
        feature.body ? `${feature.title}: ${feature.body}` : feature.title
      ),
      offers: {
        "@type": "Offer",
        url: absolute(localizedPath("/plans", locale)),
        priceCurrency: "EGP",
        availability: "https://schema.org/InStock",
      },
      publisher: { "@id": `${ORIGIN}/#organization` },
      inLanguage: locale === "ar" ? "ar" : "en",
    },
    {
      "@type": "WebPage",
      "@id": absolute(localizedPath(barePath, locale)),
      url: absolute(localizedPath(barePath, locale)),
      name: copy.title,
      description: copy.description,
      inLanguage: locale === "ar" ? "ar" : "en",
      isPartOf: { "@id": `${ORIGIN}/#website` },
    },
  ];
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

function injectIntoTemplate(template, { locale, barePath, pathname }) {
  const t = catalogs[locale];
  const copy = pageCopy(locale, barePath);
  const title = escapeHtml(copy.title || t.meta.defaultTitle);
  const description = escapeHtml(copy.description || t.meta.defaultDescription);
  const canonical = absolute(pathname);
  const enUrl = absolute(localizedPath(barePath, "en"));
  const arUrl = absolute(localizedPath(barePath, "ar"));
  const ogImage = locale === "ar" ? `${ORIGIN}/og-share-ar.jpg` : `${ORIGIN}/og-share.jpg`;
  const ogLocale = locale === "ar" ? "ar_EG" : "en_US";
  const ogAltLocale = locale === "ar" ? "en_US" : "ar_EG";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const lang = locale === "ar" ? "ar" : "en";
  const jsonLd = JSON.stringify(buildJsonLd(locale, barePath, copy));
  const h1 = escapeHtml(copy.h1 || copy.title);
  const intro = escapeHtml(introText(copy));
  const faqs = faqItems(locale, barePath);
  const featureHtml = titledList(copy.features);
  const pointHtml = titledList(copy.points);
  const policyHtml = policySectionsHtml(copy);
  const faqHeading = escapeHtml(t.home.faqHeading);
  const faqHtml = faqs.length
    ? `<h2>${faqHeading}</h2><dl>${faqs
        .map(
          (item) => `<dt>${escapeHtml(item.q)}</dt><dd>${escapeHtml(item.a)}</dd>`
        )
        .join("")}</dl>`
    : "";
  const plansUrl = absolute(localizedPath("/plans", locale));
  const technologyUrl = absolute(localizedPath("/technology", locale));
  const faqUrl = absolute(localizedPath("/faq", locale));
  const startUrl = absolute(localizedPath("/get-started", locale));

  let html = template;
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${lang}" dir="${dir}"`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${description}" />`
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonical}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en"\s+href="[^"]*"\s*\/>/,
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="ar"\s+href="[^"]*"\s*\/>/,
    `<link rel="alternate" hreflang="ar" href="${arUrl}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[^"]*"\s*\/>/,
    `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${title}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${description}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${canonical}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:image" content="${ogImage}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image:secure_url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:image:secure_url" content="${ogImage}" />`
  );
  html = html.replace(
    /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:locale" content="${ogLocale}" />`
  );
  html = html.replace(
    /<meta\s+property="og:locale:alternate"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:locale:alternate" content="${ogAltLocale}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${title}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${description}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:image" content="${ogImage}" />`
  );

  // Default: indexable. Pass --noindex (or PUBLIC_SITE_INDEXABLE=0) while the
  // public site is still gated / unpublished so Google does not cache noindex.
  const forcedNoindex =
    process.argv.includes("--noindex") ||
    process.env.PUBLIC_SITE_INDEXABLE === "0" ||
    process.env.PUBLIC_SITE_INDEXABLE === "false";
  const robots = forcedNoindex ? "noindex, nofollow" : "index, follow";
  const headExtras = `
    <meta name="robots" content="${robots}" />
    <script type="application/ld+json">${jsonLd}</script>
`;
  html = html.replace("</head>", `${headExtras}</head>`);

  const seoBlock = `
    <article id="seo-prerender" lang="${lang}" dir="${dir}" style="font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#142843">
      <p><strong>Forma</strong></p>
      <h1>${h1}</h1>
      <p>${intro}</p>
      ${featureHtml}
      ${pointHtml}
      ${policyHtml}
      ${faqHtml}
      <p><a href="${escapeHtml(enUrl)}">English</a> · <a href="${escapeHtml(arUrl)}">العربية</a></p>
      <p><a href="${escapeHtml(plansUrl)}">${escapeHtml(t.nav.plans)}</a> · <a href="${escapeHtml(technologyUrl)}">${escapeHtml(t.footer.technology)}</a> · <a href="${escapeHtml(faqUrl)}">${escapeHtml(t.footer.faq)}</a> · <a href="${escapeHtml(startUrl)}">${escapeHtml(t.nav.getStarted)}</a> · <a href="mailto:sales@forma-official.com">${escapeHtml(t.nav.contactSales)}</a></p>
    </article>
`;
  html = html.replace('<div id="root"></div>', `<div id="root"></div>${seoBlock}`);

  // Inject GSC verification if provided at build time
  const gsc = process.env.VITE_GSC_VERIFICATION || process.env.GSC_VERIFICATION;
  if (gsc) {
    html = html.replace(
      "</head>",
      `<meta name="google-site-verification" content="${escapeHtml(gsc)}" />\n</head>`
    );
  }

  return html;
}

function writeRoute(template, locale, barePath) {
  const pathname = localizedPath(barePath, locale);
  const html = injectIntoTemplate(template, { locale, barePath, pathname });
  let outFile;
  if (pathname === "/") {
    outFile = path.join(distDir, "index.html");
  } else {
    const dir = path.join(distDir, pathname.replace(/^\//, ""));
    fs.mkdirSync(dir, { recursive: true });
    outFile = path.join(dir, "index.html");
  }
  fs.writeFileSync(outFile, html, "utf8");
  console.log(`prerender ${pathname} → ${path.relative(distDir, outFile)}`);
}

function main() {
  const templatePath = path.join(distDir, "index.html");
  if (!fs.existsSync(templatePath)) {
    console.error("dist/index.html missing — run vite build first");
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, "utf8");
  for (const barePath of MARKETING_PATHS) {
    writeRoute(template, "en", barePath);
    writeRoute(template, "ar", barePath);
  }
  console.log(`Prerendered ${MARKETING_PATHS.length * 2} marketing URLs`);
}

main();
