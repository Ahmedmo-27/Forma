/**
 * Cross-site session bearer (Safari / Vercel preview).
 *
 * Production app.* ↔ api.* shares Domain cookies (same-site). Preview hosts
 * (*.vercel.app) are cross-site, so iOS Safari blocks the httpOnly cookie and
 * authenticated calls fail with "Not authorized, no token".
 *
 * When the API returns a token for cross-site clients, keep it in memory +
 * sessionStorage (never localStorage — security tests forbid JWT persistence there)
 * and attach Authorization: Bearer on subsequent requests.
 */

import { ensureAbsoluteOrigin } from "../api/axiosOrigin";

const TENANT_KEY = "ff_session_bearer";
const PLATFORM_KEY = "leap_platform_session_bearer";
const PLATFORM_REFRESH_KEY = "leap_platform_session_refresh";

const memory = {
  tenant: null,
  platform: null,
  platformRefresh: null,
};

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* private mode / quota */
  }
}

/**
 * True when the SPA origin and API origin do not share a registrable domain
 * (e.g. *.vercel.app → api.forma-official.com). Dev Vite proxy is same-origin.
 */
export function isCrossSiteApi() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return false;

  const raw = import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL;
  if (!raw) return false;

  try {
    const apiHost = new URL(ensureAbsoluteOrigin(String(raw).trim())).hostname.toLowerCase();
    const pageHost = window.location.hostname.toLowerCase();
    if (!apiHost || pageHost === apiHost) return false;

    const pageParts = pageHost.split(".").filter(Boolean);
    const apiParts = apiHost.split(".").filter(Boolean);
    if (pageParts.length >= 2 && apiParts.length >= 2) {
      const pageRoot = pageParts.slice(-2).join(".");
      const apiRoot = apiParts.slice(-2).join(".");
      if (pageRoot === apiRoot) return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function setTenantBearer(token) {
  const next = token ? String(token) : null;
  memory.tenant = next;
  writeSession(TENANT_KEY, next);
}

export function getTenantBearer() {
  if (memory.tenant) return memory.tenant;
  memory.tenant = readSession(TENANT_KEY);
  return memory.tenant;
}

export function clearTenantBearer() {
  setTenantBearer(null);
}

export function setPlatformBearers({ token, refreshToken } = {}) {
  memory.platform = token ? String(token) : null;
  memory.platformRefresh = refreshToken ? String(refreshToken) : null;
  writeSession(PLATFORM_KEY, memory.platform);
  writeSession(PLATFORM_REFRESH_KEY, memory.platformRefresh);
}

export function getPlatformBearer() {
  if (memory.platform) return memory.platform;
  memory.platform = readSession(PLATFORM_KEY);
  return memory.platform;
}

export function getPlatformRefreshBearer() {
  if (memory.platformRefresh) return memory.platformRefresh;
  memory.platformRefresh = readSession(PLATFORM_REFRESH_KEY);
  return memory.platformRefresh;
}

export function clearPlatformBearers() {
  setPlatformBearers({});
}

/** Accept login/impersonation payloads that may include tokens for cross-site. */
export function adoptTenantAuthTokens(payload) {
  if (!isCrossSiteApi()) {
    clearTenantBearer();
    return;
  }
  const token = payload?.token || payload?.accessToken || null;
  if (token) setTenantBearer(token);
  else clearTenantBearer();
}

export function adoptPlatformAuthTokens(payload) {
  if (!isCrossSiteApi()) {
    clearPlatformBearers();
    return;
  }
  const token = payload?.token || payload?.accessToken || null;
  const refreshToken = payload?.refreshToken || null;
  if (token || refreshToken) setPlatformBearers({ token, refreshToken });
  else clearPlatformBearers();
}
