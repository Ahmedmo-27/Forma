import axios from "axios";
import { apiOrigin } from "../../../api/axios";
import { normalizeError } from "../../../api/errorNormalizer";
import { emitErrorEvent } from "../../../lib/errorBus";
import {
  adoptPlatformAuthTokens,
  clearPlatformBearers,
  getPlatformBearer,
  getPlatformRefreshBearer,
} from "../../../lib/sessionBearer";
import { shouldEmitAuthErrorModal } from "../../../lib/authErrorGate";

export const platformClient = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/platform` : "/api/platform",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
  withCredentials: true,
});

// Normalized error parser backwards-compatible wrapper
export function normalizeApiError(err) {
  const norm = normalizeError(err);
  return {
    isCancelled: norm.isCancelled,
    status: norm.status,
    message: norm.message,
    details: norm.fieldErrors || norm.details || null,
    code: norm.code,
    requestId: norm.requestId,
    raw: err,
    ...norm,
  };
}

// Request Interceptor: Request ID + optional cross-site Bearer
platformClient.interceptors.request.use(
  (config) => {
    config.headers["X-Request-Id"] = `req_${crypto.randomUUID().slice(0, 8)}`;
    const bearer = getPlatformBearer();
    if (bearer && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${bearer}`;
    }
    // Callers sometimes pass a body or options object in the signal slot.
    // Axios requires a real AbortSignal and throws if addEventListener is missing.
    if (config.signal != null && typeof config.signal.addEventListener !== "function") {
      delete config.signal;
    }
    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor: 401 handling, cookie refresh, and 403 authorization
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

platformClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const normalized = normalizeApiError(error);

    if (error.response?.status === 401 && !originalRequest?._retry) {
      // Avoid looping on auth endpoints
      if (
        originalRequest?.url?.includes("/auth/login") ||
        originalRequest?.url?.includes("/auth/refresh") ||
        originalRequest?.url?.includes("/auth/logout")
      ) {
        return Promise.reject(normalized);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => platformClient(originalRequest))
          .catch((err) => Promise.reject(normalizeApiError(err)));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshBody = {};
        const storedRefresh = getPlatformRefreshBearer();
        if (storedRefresh) refreshBody.refreshToken = storedRefresh;

        const refreshRes = await axios.post(
          `${platformClient.defaults.baseURL}/auth/refresh`,
          refreshBody,
          { withCredentials: true }
        );
        adoptPlatformAuthTokens(refreshRes.data || {});

        processQueue(null, true);
        return platformClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        handleLogoutRedirect();
        if (
          !originalRequest?.skipGlobalError &&
          shouldEmitAuthErrorModal(normalized.code)
        ) {
          emitErrorEvent(normalized, { modal: true });
        }
        return Promise.reject(normalizeApiError(refreshErr));
      } finally {
        isRefreshing = false;
      }
    }

    const isAuthCode = String(normalized.code || "").startsWith("AUTH_");
    if (
      !originalRequest?.skipGlobalError &&
      (normalized.status === 403 || normalized.status === 429 || normalized.status >= 500) &&
      !(isAuthCode && !shouldEmitAuthErrorModal(normalized.code))
    ) {
      emitErrorEvent(normalized, { modal: true });
    }

    return Promise.reject(normalized);
  }
);

function handleLogoutRedirect() {
  localStorage.removeItem("leap_platform_user");
  localStorage.removeItem("leap_platform_token");
  localStorage.removeItem("leap_platform_refresh_token");
  clearPlatformBearers();

  const path = window.location.pathname;
  if (path.startsWith("/platform") && !path.includes("/login")) {
    window.location.href = "/platform/login";
  }
}

export default platformClient;
