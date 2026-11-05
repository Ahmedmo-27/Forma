import axios from "axios";
import { apiOrigin } from "../../../api/axios";

export const platformClient = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/platform` : "/api/platform",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Normalized error parser
export function normalizeApiError(err) {
  if (axios.isCancel(err)) {
    return { isCancelled: true, message: "Request cancelled", status: 0 };
  }

  const status = err.response?.status || 500;
  const message =
    err.response?.data?.message ||
    err.response?.data?.error ||
    err.message ||
    "An unexpected error occurred while communicating with the platform API";
  const details = err.response?.data?.errors || null;

  return { isCancelled: false, status, message, details, raw: err };
}

// Request Interceptor: Injects platform authorization token
platformClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("leap_platform_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Avoid looping on auth endpoints
      if (
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/refresh") ||
        originalRequest.url?.includes("/auth/mfa/")
      ) {
        return Promise.reject(normalizeApiError(error));
      }

      const refreshToken = localStorage.getItem("leap_platform_refresh_token");
      if (!refreshToken) {
        handleLogoutRedirect();
        return Promise.reject(normalizeApiError(error));
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
        return Promise.reject(normalizeApiError(refreshErr));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normalizeApiError(error));
  }
);

function handleLogoutRedirect() {
  localStorage.removeItem("leap_platform_token");
  localStorage.removeItem("leap_platform_refresh_token");
  localStorage.removeItem("leap_platform_user");

  const path = window.location.pathname;
  if (path.startsWith("/platform") && !path.includes("/login")) {
    window.location.href = "/platform/login";
  } else if (path.startsWith("/platform") && !path.includes("/login")) {
    window.location.href = "/platform/login";
  }
}

export default platformClient;
