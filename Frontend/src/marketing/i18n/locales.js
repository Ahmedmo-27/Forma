/** Marketing locales for www.forma-official.com */

export const LOCALES = ["en", "ar"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_META = {
  en: { htmlLang: "en", dir: "ltr", ogLocale: "en_US", label: "English", short: "EN" },
  ar: { htmlLang: "ar", dir: "rtl", ogLocale: "ar_EG", label: "العربية", short: "ع" },
};

/** Paths without locale prefix (English canonical). */
export const MARKETING_PATHS = [
  "/",
  "/why-forma",
  "/plans",
  "/get-started",
  "/gym-management-software-egypt",
  "/whatsapp-gym-crm",
  "/multi-branch-gym-software",
  "/technology",
  "/faq",
  "/privacy",
  "/terms",
  "/refunds",
];

export function isLocale(value) {
  return LOCALES.includes(value);
}

/** Detect locale from pathname (`/ar/...` → ar, else en). */
export function localeFromPathname(pathname = "/") {
  const parts = String(pathname).split("/").filter(Boolean);
  if (parts[0] === "ar") return "ar";
  return "en";
}

/** Strip `/ar` prefix; English paths unchanged. */
export function stripLocalePrefix(pathname = "/") {
  const raw = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (raw === "/ar" || raw.startsWith("/ar/")) {
    const rest = raw.slice(3) || "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return raw === "" ? "/" : raw;
}

/**
 * Build a locale-aware path.
 * EN: `/`, `/plans` — AR: `/ar`, `/ar/plans`
 */
export function localizedPath(path = "/", locale = DEFAULT_LOCALE) {
  const bare = stripLocalePrefix(path);
  const normalized = bare === "/" ? "/" : bare.startsWith("/") ? bare : `/${bare}`;
  if (locale === "ar") {
    return normalized === "/" ? "/ar" : `/ar${normalized}`;
  }
  return normalized;
}

/** Switch current path to the other locale. */
export function alternatePath(pathname, targetLocale) {
  return localizedPath(stripLocalePrefix(pathname), targetLocale);
}

/** All absolute marketing pathnames for sitemap / prerender (both locales). */
export function allMarketingPathnames() {
  const out = [];
  for (const path of MARKETING_PATHS) {
    out.push(localizedPath(path, "en"));
    out.push(localizedPath(path, "ar"));
  }
  return out;
}
