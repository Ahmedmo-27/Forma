import axios from "axios";
import { apiOrigin } from "../../../api/axios";
import { normalizeError } from "../../../api/errorNormalizer";
import { emitErrorEvent } from "../../../lib/errorBus";

export const platformClient = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/platform` : "/api/platform",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
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

// Request Interceptor: Injects platform authorization token and Request ID
platformClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("leap_platform_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["X-Request-Id"] = `req_${crypto.randomUUID().slice(0, 8)}`;
    // Callers sometimes pass a body or options object in the signal slot.
    // Axios requires a real AbortSignal and throws if addEventListener is missing.
    if (config.signal != null && typeof config.signal.addEventListener !== "function") {
      delete config.signal;
    }
    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

// Response Interceptor: 401 handling, refresh token rotation, and 403 authorization
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
        originalRequest?.url?.includes("/auth/refresh")
      ) {
        return Promise.reject(normalized);
      }

      const refreshToken = localStorage.getItem("leap_platform_refresh_token");
      if (!refreshToken) {
        handleLogoutRedirect();
        emitErrorEvent(normalized, { modal: true });
        return Promise.reject(normalized);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return platformClient(originalRequest);
          })
          .catch((err) => Promise.reject(normalizeApiError(err)));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post(
          `${platformClient.defaults.baseURL}/auth/refresh`,
          { refreshToken }
        );

        const { token: newToken, refreshToken: newRefreshToken } = refreshRes.data;
        localStorage.setItem("leap_platform_token", newToken);
        if (newRefreshToken) {
          localStorage.setItem("leap_platform_refresh_token", newRefreshToken);
        }

        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return platformClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        handleLogoutRedirect();
        emitErrorEvent(normalized, { modal: true });
        return Promise.reject(normalizeApiError(refreshErr));
      } finally {
        isRefreshing = false;
      }
    }

    if (!originalRequest?.skipGlobalError && (normalized.status === 403 || normalized.status === 429 || normalized.status >= 500)) {
      emitErrorEvent(normalized, { modal: true });
    }

    return Promise.reject(normalized);
  }
);

function handleLogoutRedirect() {
  localStorage.removeItem("leap_platform_token");
  localStorage.removeItem("leap_platform_refresh_token");
  localStorage.removeItem("leap_platform_user");

  const path = window.location.pathname;
  if (path.startsWith("/platform") && !path.includes("/login")) {
    window.location.href = "/platform/login";
  }
}

export default platformClient;
