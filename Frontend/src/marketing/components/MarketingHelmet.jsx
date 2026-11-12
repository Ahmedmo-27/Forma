import { Helmet } from "react-helmet-async";
import {
  SITE_NAME,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  OG_IMAGE_PATH,
  absoluteMarketingUrl,
  absoluteAssetUrl,
} from "../seo";

/**
 * Per-route title, description, canonical, and Open Graph / Twitter cards.
 * Pass `jsonLd` (object) for structured data on home (or other) pages.
 */
export default function MarketingHelmet({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  noIndex = false,
  jsonLd = null,
  ogType = "website",
}) {
  const fullTitle = title || DEFAULT_TITLE;
  const canonical = absoluteMarketingUrl(path);
  const image = absoluteAssetUrl(OG_IMAGE_PATH);
  const robots = noIndex ? "noindex, nofollow" : "index, follow";

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonical} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLd ? (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      ) : null}
    </Helmet>
  );
}
