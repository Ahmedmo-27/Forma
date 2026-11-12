/** Shared marketing SEO defaults for www.forma-official.com */

export const SITE_NAME = "Forma";
export const DEFAULT_TITLE = "Forma — Gym & Fitness Management";
export const DEFAULT_DESCRIPTION =
  "Forma is the gym operating system for members, check-ins, sales CRM, coaching, and billing — sales-assisted onboarding with bank transfer.";
export const OG_IMAGE_PATH = "/og-share.jpg";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = "Forma — gym & fitness management";
/** Always absolute for crawlers / share scrapers that ignore relative URLs. */
export const OG_IMAGE_ABSOLUTE = "https://www.forma-official.com/og-share.jpg";

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

export function homeJsonLd() {
  const origin = marketingOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE_NAME,
        url: origin,
        email: "sales@forma-official.com",
        logo: absoluteAssetUrl("/forma-horizontal.jpeg"),
        image: OG_IMAGE_ABSOLUTE,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#software`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: origin,
        description: DEFAULT_DESCRIPTION,
        offers: {
          "@type": "Offer",
          url: absoluteMarketingUrl("/plans"),
          priceCurrency: "EGP",
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}
