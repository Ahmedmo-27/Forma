import axios from "axios";
import { apiOrigin } from "../../api/axios";
import { normalizeError } from "../../api/errorNormalizer";
import { emitErrorEvent } from "../../lib/errorBus";

const platformAxios = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/platform` : "/api/platform",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 20000,
});

platformAxios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("leap_platform_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["X-Request-Id"] = `req_${crypto.randomUUID().slice(0, 8)}`;
    return config;
  },
  (error) => Promise.reject(error)
);

platformAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeError(error);
    error.normalized = normalized;

    if (error.config?.skipGlobalError) {
      return Promise.reject(error);
    }

    const isLoginEndpoint = error.config?.url?.includes("/auth/login");
    if (!isLoginEndpoint && (normalized.status === 401 || normalized.status === 403 || normalized.status === 429 || normalized.status >= 500)) {
      emitErrorEvent(normalized, { modal: true });
    }

    return Promise.reject(error);
  }
);

export default platformAxios;
