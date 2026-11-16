const COOKIE_NAME = "forma_www_preview";

function isFormaOfficialHost(hostname = window.location.hostname) {
  return hostname === "forma-official.com" || hostname.endsWith(".forma-official.com");
}

/**
 * Legacy helper — platform session is now an httpOnly cookie shared via Domain=.BASE_DOMAIN.
 * Clearing removes any old JS-readable preview JWT cookie.
 */
export function setWwwPreviewCookie() {
  // no-op: unpublished www preview uses forma_platform httpOnly cookie + withCredentials
}

export function clearWwwPreviewCookie() {
  if (typeof document === "undefined") return;
  const base = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = base;
  if (isFormaOfficialHost()) {
    document.cookie = `${base}; Domain=.forma-official.com`;
  }
}

/** @deprecated Prefer cookie session via withCredentials; always returns null. */
export function readWwwPreviewToken() {
  clearWwwPreviewCookie();
  return null;
}
