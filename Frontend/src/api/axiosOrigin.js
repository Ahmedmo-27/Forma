/**
 * Turn a host-only BACKEND_ORIGIN into an absolute URL.
 * Misconfig like `api.forma-official.com` (no scheme) becomes a path on the SPA host
 * and yields POST 405 from Vercel: https://app…/api.forma-official.com/api/users/login
 */
export function ensureAbsoluteOrigin(url) {
  if (!url) return url;
  const trimmed = String(url).trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(?::\d+)?(\/|$)/i.test(trimmed) || /^127\.0\.0\.1(?::\d+)?(\/|$)/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/** Ensure base URL ends with /api (backend mounts routes under /api/*). */
export function normalizeApiBaseURL(url) {
  if (!url) return url;
  const absolute = ensureAbsoluteOrigin(url);
  const trimmed = absolute.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
