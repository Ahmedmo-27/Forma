/**
 * Suppress conflicting auth error modals during login transitions.
 * Login can succeed (toast) while a parallel boot request still returns 401
 * before the cookie/bearer is attached — that must not open System Error.
 */

let suppressUntil = 0;

export function suppressAuthErrorModals(ms = 4000) {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

export function isAuthErrorSuppressed() {
  return Date.now() < suppressUntil;
}

export function isAuthRoutePath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  const path = String(pathname || "");
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/platform/login" ||
    path.startsWith("/platform/login/") ||
    path.startsWith("/auth/")
  );
}

export function shouldEmitAuthErrorModal(code) {
  if (!code || !String(code).startsWith("AUTH_")) return true;
  if (isAuthErrorSuppressed()) return false;
  if (isAuthRoutePath()) return false;
  return true;
}
