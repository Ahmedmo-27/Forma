import { Helmet } from "react-helmet-async";
import {
  SITE_NAME,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  absoluteMarketingUrl,
  hreflangAlternates,
  ogImageForLocale,
  ogImageAltForLocale,
} from "../seo";
import { useMarketingI18n, stripLocalePrefix, LOCALE_META } from "../i18n";

/**
 * Per-route title, description, canonical, hreflang, and Open Graph / Twitter cards.
 * Pass `jsonLd` (object) for structured data.
 * Note: WhatsApp/Facebook scrapers read static tags in index.html, not these — prerender covers that.
 */
export default function MarketingHelmet({
  title,
  description,
  path,
  noIndex = false,
  jsonLd = null,
  ogType = "website",
}) {
  const { locale, meta, barePath } = useMarketingI18n();
  const bare = path != null ? stripLocalePrefix(path) : barePath;
  const fullTitle = title || DEFAULT_TITLE;
  const desc = description || DEFAULT_DESCRIPTION;
  const canonicalPath =
    locale === "ar"
      ? bare === "/"
        ? "/ar"
        : `/ar${bare}`
      : bare;
  const canonical = absoluteMarketingUrl(canonicalPath);
  const image = ogImageForLocale(locale);
  const imageAlt = ogImageAltForLocale(locale);
  const robots = noIndex ? "noindex, nofollow" : "index, follow";
  const alternates = hreflangAlternates(bare);
  const otherOgLocale =
    locale === "ar" ? LOCALE_META.en.ogLocale : LOCALE_META.ar.ogLocale;

  return (
    <Helmet prioritizeSeoTags htmlAttributes={{ lang: meta.htmlLang, dir: meta.dir }}>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonical} />

      <link rel="alternate" hrefLang="en" href={alternates.en} />
      <link rel="alternate" hrefLang="ar" href={alternates.ar} />
      <link rel="alternate" hrefLang="x-default" href={alternates.xDefault} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:locale" content={meta.ogLocale} />
      <meta property="og:locale:alternate" content={otherOgLocale} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {jsonLd ? (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      ) : null}
    </Helmet>
  );
}
