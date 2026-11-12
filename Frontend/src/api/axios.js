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
const apiBaseURL = normalizeApiBaseURL(rawApiURL);
export { apiBaseURL };

/** Server origin without /api — use for authenticated /uploads downloads. */
export const apiOrigin = apiBaseURL?.replace(/\/api$/, "") ?? "";

/**
 * Fetch a protected upload with the staff Bearer token and return a blob URL.
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
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ff_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Tenant scoping header
  const tenantSlug = localStorage.getItem("ff_tenant_slug");
  if (tenantSlug) config.headers["X-Tenant-Slug"] = tenantSlug;

  const reqId = `req_${crypto.randomUUID().slice(0, 8)}`;
  config.headers["X-Request-Id"] = reqId;
  logRequest(config);
  return config;
});

api.interceptors.response.use(
  (res) => {
    logResponse(res);
    return res;
  },
  (err) => {
    logError(err);
    const normalized = normalizeError(err);
    err.normalized = normalized;

    // Support opt-out of global error handling
    if (err.config?.skipGlobalError) {
      return Promise.reject(err);
    }

    const isLoginEndpoint = err.config?.url?.includes("/users/login");

    // Don't intercept login validation errors with modals
    if (isLoginEndpoint) {
      return Promise.reject(err);
    }

    const catalogMeta = ERROR_MESSAGES[normalized.code] || ERROR_MESSAGES.INTERNAL_ERROR;

    if (catalogMeta.presentation === "modal" || normalized.status === 403 || normalized.status === 429 || normalized.status >= 500) {
      emitErrorEvent(normalized, { modal: true });
    } else if (catalogMeta.presentation === "banner") {
      emitErrorEvent(normalized, { banner: true });
    } else if (catalogMeta.presentation === "toast") {
      toast.error(normalized.message);
    }

    return Promise.reject(err);
  }
);

export default api;
