export {
  MarketingI18nProvider,
  MarketingI18nContext,
  useMarketingI18n,
} from "./MarketingI18nProvider";

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  MARKETING_PATHS,
  localeFromPathname,
  localizedPath,
  alternatePath,
  stripLocalePrefix,
  allMarketingPathnames,
} from "./locales";

export { default as enMessages } from "./en";
export { default as arMessages } from "./ar";
