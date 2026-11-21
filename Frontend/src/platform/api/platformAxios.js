import axios from "axios";
import { apiOrigin } from "../../api/axios";
import { normalizeError } from "../../api/errorNormalizer";
import { emitErrorEvent } from "../../lib/errorBus";
import { getPlatformBearer } from "../../lib/sessionBearer";
import { shouldEmitAuthErrorModal } from "../../lib/authErrorGate";

const platformAxios = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/platform` : "/api/platform",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 20000,
  withCredentials: true,
});

platformAxios.interceptors.request.use(
  (config) => {
    config.headers["X-Request-Id"] = `req_${crypto.randomUUID().slice(0, 8)}`;
    const bearer = getPlatformBearer();
    if (bearer && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${bearer}`;
    }
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
    const isAuthCode = String(normalized.code || "").startsWith("AUTH_");
    if (
      !isLoginEndpoint &&
      (normalized.status === 401 || normalized.status === 403 || normalized.status === 429 || normalized.status >= 500) &&
      !(isAuthCode && !shouldEmitAuthErrorModal(normalized.code))
    ) {
      emitErrorEvent(normalized, { modal: true });
    }

    return Promise.reject(error);
  }
);

export default platformAxios;
