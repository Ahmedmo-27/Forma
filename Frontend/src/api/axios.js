import axios from "axios";
import toast from "react-hot-toast";
import { logRequest, logResponse, logError } from "./apiLogger";
import { normalizeError } from "./errorNormalizer";
import { emitErrorEvent } from "../lib/errorBus";
import { ERROR_MESSAGES } from "../lib/errorCatalog";

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

const rawApiURL = import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL;
/** Dev uses Vite proxy (same origin) so httpOnly cookies work without Domain. */
export const apiBaseURL = import.meta.env.DEV ? "/api" : normalizeApiBaseURL(rawApiURL);

/** Server origin without /api — use for authenticated /uploads downloads. */
export const apiOrigin = import.meta.env.DEV ? "" : (apiBaseURL?.replace(/\/api$/, "") ?? "");

/**
 * Fetch a protected upload with the cookie session and return a blob URL.
 * Callers should revoke the URL when done (URL.revokeObjectURL).
 */
export async function fetchProtectedUploadBlobUrl(filename) {
  const name = String(filename).split(/[/\\]/).pop();
  const res = await api.get(`${apiOrigin}/uploads/${encodeURIComponent(name)}`, {
    responseType: "blob",
    skipGlobalError: true,
  });
  return URL.createObjectURL(res.data);
}

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 15000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // Tenant scoping header (hint only — auth is cookie/Bearer)
  const tenantSlug = localStorage.getItem("ff_tenant_slug");
  if (tenantSlug) config.headers["X-Tenant-Slug"] = tenantSlug;

  // Branch / location scope (all | ObjectId)
  const locationId = localStorage.getItem("ff_location_id");
  if (locationId) config.headers["X-Location-Id"] = locationId;

  const reqId = `req_${crypto.randomUUID().slice(0, 8)}`;
  config.headers["X-Request-Id"] = reqId;
  logRequest(config);
  return config;
});

function isTimeoutError(err) {
  return (
    err?.code === "ECONNABORTED" ||
    err?.normalized?.code === "REQUEST_TIMEOUT" ||
    String(err?.message || "").toLowerCase().includes("timeout")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

api.interceptors.response.use(
  (res) => {
    logResponse(res);
    return res;
  },
  async (err) => {
    const config = err.config;

    // One GET retry after deploy/cold-start timeouts (idempotent only).
    if (
      config &&
      !config.__retried &&
      String(config.method || "get").toLowerCase() === "get" &&
      isTimeoutError(err)
    ) {
      config.__retried = true;
      await sleep(1500);
      return api.request(config);
    }

    logError(err);
    const normalized = normalizeError(err);
    err.normalized = normalized;

    // Support opt-out of global error handling
    if (config?.skipGlobalError) {
      return Promise.reject(err);
    }

    const isLoginEndpoint = config?.url?.includes("/users/login");

    // Don't intercept login validation errors with modals
    if (isLoginEndpoint) {
      return Promise.reject(err);
    }

    const catalogMeta = ERROR_MESSAGES[normalized.code] || ERROR_MESSAGES.INTERNAL_ERROR;
    const presentation = catalogMeta.presentation;

    // Plan/feature gates are handled by FeatureGate and nav — never a global modal.
    if (presentation === "silent") {
      return Promise.reject(err);
    }

    if (presentation === "modal" || normalized.status === 403 || normalized.status === 429 || normalized.status >= 500) {
      emitErrorEvent(normalized, { modal: true });
    } else if (presentation === "banner") {
      emitErrorEvent(normalized, { banner: true });
    } else if (presentation === "toast") {
      toast.error(normalized.message);
    }

    return Promise.reject(err);
  }
);

export default api;
