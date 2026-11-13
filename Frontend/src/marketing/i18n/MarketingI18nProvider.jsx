import { createContext, useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
import en from "./en";
import ar from "./ar";
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  localeFromPathname,
  localizedPath,
  alternatePath,
  stripLocalePrefix,
} from "./locales";

const catalogs = { en, ar };

export const MarketingI18nContext = createContext(null);

export function MarketingI18nProvider({ children, locale: localeProp }) {
  const { pathname } = useLocation();
  const locale = localeProp || localeFromPathname(pathname);
  const value = useMemo(() => {
    const messages = catalogs[locale] || catalogs[DEFAULT_LOCALE];
    const meta = LOCALE_META[locale] || LOCALE_META[DEFAULT_LOCALE];
    return {
      locale,
      messages,
      meta,
      t: messages,
      path: (p) => localizedPath(p, locale),
      alternate: (target) => alternatePath(pathname, target || (locale === "ar" ? "en" : "ar")),
      barePath: stripLocalePrefix(pathname),
    };
  }, [locale, pathname]);

  return (
    <MarketingI18nContext.Provider value={value}>{children}</MarketingI18nContext.Provider>
  );
}

export function useMarketingI18n() {
  const ctx = useContext(MarketingI18nContext);
  if (!ctx) {
    throw new Error("useMarketingI18n must be used within MarketingI18nProvider");
  }
  return ctx;
}
