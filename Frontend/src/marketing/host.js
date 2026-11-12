/**
 * Production host split (same Vercel project, different hostnames):
 * - www.forma-official.com (apex → www) — public marketing, plans, get-started
 * - app.forma-official.com — gym staff login + tenant dashboards (+ /platform if no platform.*)
 * - api.forma-official.com — Railway API
 *
 * Local: VITE_SITE=www previews marketing on localhost; staff routes stay same-origin.
 */
const MARKETING_HOSTS = new Set([
  "www.forma-official.com",
  "forma-official.com",
]);

function currentHostname() {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

function isLocalhostHostname(hostname = currentHostname()) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * True when this SPA instance should render the public www funnel.
 * Local preview: set VITE_SITE=www in Frontend/.env
 */
export function isMarketingHost() {
  if (import.meta.env.VITE_SITE === "www") return true;
  if (typeof window === "undefined") return false;
  return MARKETING_HOSTS.has(currentHostname());
}

/** Local Vite with VITE_SITE=www — marketing + staff share one origin. */
export function isLocalMarketingPreview() {
  return import.meta.env.VITE_SITE === "www" && isLocalhostHostname();
}

/**
 * Production www/apex: staff, auth, and platform paths hard-redirect to app.*.
 * False on localhost preview (same origin serves both).
 */
export function shouldHardRedirectToApp() {
  if (typeof window === "undefined") return false;
  if (isLocalMarketingPreview()) return false;
  if (!MARKETING_HOSTS.has(currentHostname())) return false;
  return appOrigin() !== window.location.origin;
}

/** Absolute origin for the gym staff app (app.forma-official.com in prod). */
export function appOrigin() {
  if (typeof window === "undefined") return "https://app.forma-official.com";
  const { protocol, hostname, origin } = window.location;
  if (isLocalhostHostname(hostname)) return origin;
  const host = hostname.toLowerCase();
  if (host.startsWith("www.")) return `${protocol}//app.${host.slice(4)}`;
  if (host === "forma-official.com") return `${protocol}//app.forma-official.com`;
  if (host.startsWith("app.")) return origin;
  return "https://app.forma-official.com";
}

/** Role home path or full app URL when leaving www. */
export function staffHomeHref(path) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  if (shouldHardRedirectToApp()) {
    return `${appOrigin()}${safePath}`;
  }
  return safePath;
}

export function goToStaffHome(path, navigate) {
  const href = staffHomeHref(path);
  if (/^https?:\/\//i.test(href)) {
    window.location.assign(href);
    return;
  }
  navigate(href, { replace: true });
}

export const SALES_EMAIL = "sales@forma-official.com";
export const SALES_MAILTO = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Forma — talk to sales")}`;
