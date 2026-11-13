/** Shared marketing SEO defaults for www.forma-official.com */

import { DEFAULT_LOCALE, localizedPath } from "./i18n/locales";
import en from "./i18n/en";
import ar from "./i18n/ar";

const catalogs = { en, ar };

export const SITE_NAME = "Forma";
export const DEFAULT_TITLE = en.meta.defaultTitle;
export const DEFAULT_DESCRIPTION = en.meta.defaultDescription;
export const OG_IMAGE_PATH = "/og-share.jpg";
export const OG_IMAGE_PATH_AR = "/og-share-ar.jpg";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = "Forma — gym management software in Egypt";
export const OG_IMAGE_ALT_AR = "فورما — برنامج إدارة الجيم في مصر";
/** Always absolute for crawlers / share scrapers that ignore relative URLs. */
export const OG_IMAGE_ABSOLUTE = "https://www.forma-official.com/og-share.jpg";
export const OG_IMAGE_ABSOLUTE_AR = "https://www.forma-official.com/og-share-ar.jpg";

/** Absolute marketing origin (www in production; current origin locally). */
export function marketingOrigin() {
  if (typeof window === "undefined") return "https://www.forma-official.com";
  const { protocol, hostname, origin } = window.location;
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return origin;
  if (host.startsWith("www.")) return origin;
  if (host === "forma-official.com") return `${protocol}//www.forma-official.com`;
  return "https://www.forma-official.com";
}

/** Absolute URL for a marketing path (pathname should start with /). */
export function absoluteMarketingUrl(pathname = "/") {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${marketingOrigin()}${path === "/" ? "/" : path}`;
}

export function absoluteAssetUrl(path) {
  const safe = path.startsWith("/") ? path : `/${path}`;
  return `${marketingOrigin()}${safe}`;
}

export function messagesFor(locale = DEFAULT_LOCALE) {
  return catalogs[locale] || catalogs.en;
}

export function ogImageForLocale(locale = DEFAULT_LOCALE) {
  return locale === "ar" ? OG_IMAGE_ABSOLUTE_AR : OG_IMAGE_ABSOLUTE;
}

export function ogImageAltForLocale(locale = DEFAULT_LOCALE) {
  return locale === "ar" ? OG_IMAGE_ALT_AR : OG_IMAGE_ALT;
}

/** hreflang alternate map for a bare path (without /ar). */
export function hreflangAlternates(barePath = "/") {
  const enPath = localizedPath(barePath, "en");
  const arPath = localizedPath(barePath, "ar");
  return {
    en: absoluteMarketingUrl(enPath),
    ar: absoluteMarketingUrl(arPath),
    xDefault: absoluteMarketingUrl(enPath),
  };
}

export function homeJsonLd(locale = DEFAULT_LOCALE) {
  const origin = marketingOrigin();
  const t = messagesFor(locale);
  const homePath = localizedPath("/", locale);
  const plansPath = localizedPath("/plans", locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE_NAME,
        alternateName: locale === "ar" ? "فورما" : undefined,
        url: origin,
        email: "sales@forma-official.com",
        logo: absoluteAssetUrl("/forma-horizontal.jpeg"),
        image: ogImageForLocale(locale),
        areaServed: {
          "@type": "Country",
          name: "Egypt",
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#software`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: absoluteMarketingUrl(homePath),
        description: t.meta.defaultDescription,
        browserRequirements: t.meta.browserRequirements,
        featureList: (t.home.features || []).map((feature) =>
          feature.body ? `${feature.title}: ${feature.body}` : feature.title
        ),
        offers: {
          "@type": "Offer",
          url: absoluteMarketingUrl(plansPath),
          priceCurrency: "EGP",
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": `${origin}/#organization` },
        inLanguage: locale === "ar" ? "ar" : "en",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: SITE_NAME,
        description: t.meta.defaultDescription,
        publisher: { "@id": `${origin}/#organization` },
        inLanguage: ["en", "ar"],
      },
    ],
  };
}

export function faqJsonLd(faqItems = [], locale = DEFAULT_LOCALE) {
  if (!faqItems.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale === "ar" ? "ar" : "en",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function combineJsonLd(...blocks) {
  const graphs = [];
  let standalone = [];
  for (const block of blocks) {
    if (!block) continue;
    if (block["@graph"]) {
      graphs.push(...block["@graph"]);
    } else {
      standalone.push(block);
    }
  }
  if (!graphs.length && standalone.length === 1) return standalone[0];
  return {
    "@context": "https://schema.org",
    "@graph": [...graphs, ...standalone],
  };
}
