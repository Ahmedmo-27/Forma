import axios from "axios";
import { ERROR_CODES } from "../lib/errorCodes";
import { ERROR_MESSAGES, formatErrorMessage } from "../lib/errorCatalog";

/**
 * Normalizes any error (Axios, Network, Timeout, Cancel, DOM, or Runtime)
 * into a single unified AppErrorView structure.
 *
 * AppErrorView: {
 *   isCancelled: boolean,
 *   isOffline: boolean,
 *   code: string,
 *   title: string,
 *   message: string,
 *   status: number,
 *   requestId: string,
 *   fieldErrors: Record<string, string[]>,
 *   details: Record<string, any>,
 *   retryable: boolean,
 *   retryAfter: number | null,
 *   raw: any,
 * }
 */
export function normalizeError(err) {
  // 1. Cancelled / Aborted Request
  if (axios.isCancel(err) || err?.name === "CanceledError" || err?.name === "AbortError") {
    return {
      isCancelled: true,
      isOffline: false,
      code: "REQUEST_CANCELLED",
      title: "Request Cancelled",
      message: "The operation was cancelled.",
      status: 0,
      requestId: null,
      fieldErrors: {},
      details: {},
      retryable: false,
      retryAfter: null,
      raw: err,
    };
  }

  // 2. Client Offline / Network Failure
  if (!navigator.onLine || err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
    const code = "NETWORK_OFFLINE";
    const catalogItem = ERROR_MESSAGES[code];
    return {
      isCancelled: false,
      isOffline: true,
      code,
      title: catalogItem.title,
      message: catalogItem.message,
      status: 0,
      requestId: null,
      fieldErrors: {},
      details: {},
      retryable: true,
      retryAfter: null,
      raw: err,
    };
  }

  // 3. Request Timeout
  if (err?.code === "ECONNABORTED" || err?.message?.toLowerCase().includes("timeout")) {
    const code = "REQUEST_TIMEOUT";
    const catalogItem = ERROR_MESSAGES[code];
    return {
      isCancelled: false,
      isOffline: false,
      code,
      title: catalogItem.title,
      message: catalogItem.message,
      status: 408,
      requestId: err?.config?.headers?.["X-Request-Id"] || null,
      fieldErrors: {},
      details: {},
      retryable: true,
      retryAfter: null,
      raw: err,
    };
  }

  // 4. Axios Response from Backend
  if (err?.response) {
    const status = err.response.status || 500;
    const data = err.response.data;

    // Check if response is non-JSON (e.g. HTML from Nginx/Vercel/CDN gateway error)
    const isHtml =
      typeof data === "string" &&
      (data.trim().startsWith("<!DOCTYPE") || data.trim().startsWith("<html"));

    if (isHtml) {
      const code = status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INTERNAL_ERROR";
      const catalogItem = ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
      return {
        isCancelled: false,
        isOffline: false,
        code,
        title: catalogItem.title,
        message: "The server returned an unexpected response. Please try again shortly.",
        status,
        requestId: err.response.headers?.["x-request-id"] || null,
        fieldErrors: {},
        details: { htmlPreview: data.slice(0, 150) },
        retryable: true,
        retryAfter: null,
        raw: err,
      };
    }

    // Standard envelope extraction
    const envelope = data?.error || {};
    const code =
      envelope.code ||
      data?.code ||
      (status === 404
        ? "RESOURCE_NOT_FOUND"
        : status === 403
        ? "AUTH_FORBIDDEN"
        : status === 401
        ? "AUTH_TOKEN_INVALID"
        : status === 400
        ? "VALIDATION_FAILED"
        : status === 429
        ? "RATE_LIMITED"
        : "INTERNAL_ERROR");

    const requestId =
      envelope.requestId ||
      err.response.headers?.["x-request-id"] ||
      err.config?.headers?.["X-Request-Id"] ||
      null;

    const details = {
      ...(data?.details || {}),
      ...(envelope.details || {}),
      ...(data?.feature ? { feature: data.feature } : {}),
      ...(data?.limit ? { limit: data.limit } : {}),
      ...(data?.max != null ? { max: data.max } : {}),
      ...(data?.current != null ? { current: data.current } : {}),
      ...(data?.role ? { role: data.role } : {}),
    };

    const fieldErrors =
      envelope.fieldErrors ||
      data?.fieldErrors ||
      (data?.errors && typeof data.errors === "object" ? data.errors : {});

    const retryAfter =
      envelope.retryAfter != null
        ? envelope.retryAfter
        : data?.retryAfter != null
        ? data.retryAfter
        : null;

    const catalogItem = ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
    const title = envelope.title || catalogItem.title;
    const message = formatErrorMessage(
      code,
      details,
      envelope.message || data?.message
    );

    const retryable =
      envelope.retryable !== undefined
        ? envelope.retryable
        : ERROR_CODES[code]?.retryable ?? (status >= 500 || status === 429);

    return {
      isCancelled: false,
      isOffline: false,
      code,
      title,
      message,
      status,
      requestId,
      fieldErrors,
      details,
      retryable,
      retryAfter,
      raw: err,
    };
  }

  // 5. Native JavaScript / Unknown Runtime Error
  const code = "INTERNAL_ERROR";
  const catalogItem = ERROR_MESSAGES.INTERNAL_ERROR;
  return {
    isCancelled: false,
    isOffline: false,
    code,
    title: catalogItem.title,
    message: err?.message || catalogItem.message,
    status: 500,
    requestId: null,
    fieldErrors: {},
    details: {},
    retryable: true,
    retryAfter: null,
    raw: err,
  };
}
