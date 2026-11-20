import { noteFailedRequest } from '../lib/monitoring';

const isDev = import.meta.env.DEV;

function formatError(err) {
  if (err.response) {
    return {
      status: err.response.status,
      reason: err.response.data?.message || err.response.data?.error || err.message,
      data: err.response.data,
    };
  }
  if (err.request) {
    return { reason: 'No response from server', message: err.message };
  }
  return { reason: err.message };
}

export function logRequest(config) {
  if (!isDev) return;
  console.debug('[API →]', config.method?.toUpperCase(), config.url, {
    requestId: config.headers?.['X-Request-Id'],
  });
}

export function logResponse(response) {
  if (!isDev) return;
  const requestId = response.headers?.['x-request-id'];
  console.debug('[API ✓]', response.config.method?.toUpperCase(), response.config.url, {
    status: response.status,
    requestId,
  });
}

export function logError(err) {
  const method = err.config?.method?.toUpperCase();
  const url = err.config?.url;
  const requestId = err.response?.headers?.['x-request-id'] || err.config?.headers?.['X-Request-Id'];
  const details = formatError(err);
  if (!err.response || err.response.status >= 500) noteFailedRequest(requestId, err.response?.status);

  if (isDev) {
    console.warn('[API ✗]', method, url, { requestId, ...details });
  } else if (err.response?.status >= 500) {
    console.error('[API]', method, url, requestId, details.reason);
  }
}
