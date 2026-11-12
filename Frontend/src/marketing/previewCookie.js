const COOKIE_NAME = "forma_www_preview";

function isFormaOfficialHost(hostname = window.location.hostname) {
  return hostname === "forma-official.com" || hostname.endsWith(".forma-official.com");
}

/** Share platform JWT with www.* so super_admin can preview unpublished marketing. */
export function setWwwPreviewCookie(token) {
  if (!token || typeof document === "undefined") return;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 12}`,
  ];
  if (window.location.protocol === "https:") parts.push("Secure");
  if (isFormaOfficialHost()) parts.push("Domain=.forma-official.com");
  document.cookie = parts.join("; ");
}

export function clearWwwPreviewCookie() {
  if (typeof document === "undefined") return;
  const base = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = base;
  if (isFormaOfficialHost()) {
    document.cookie = `${base}; Domain=.forma-official.com`;
  }
}

export function readWwwPreviewToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (match?.[1]) return decodeURIComponent(match[1]);
  try {
    return localStorage.getItem("leap_platform_token");
  } catch {
    return null;
  }
}
