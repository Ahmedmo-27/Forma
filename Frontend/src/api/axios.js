import axios from 'axios';
import toast from 'react-hot-toast';
import { logRequest, logResponse, logError } from './apiLogger';

/** Ensure base URL ends with /api (backend mounts routes under /api/*). */
function normalizeApiBaseURL(url) {
  if (!url) return url;
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const rawApiURL = import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL;
const apiBaseURL = normalizeApiBaseURL(rawApiURL);

/** Server origin without /api — use for authenticated /uploads downloads. */
export const apiOrigin = apiBaseURL?.replace(/\/api$/, '') ?? '';

/**
 * Fetch a protected upload with the staff Bearer token and return a blob URL.
 * Callers should revoke the URL when done (URL.revokeObjectURL).
 */
export async function fetchProtectedUploadBlobUrl(filename) {
  const name = String(filename).split(/[/\\]/).pop();
  const res = await api.get(`${apiOrigin}/uploads/${encodeURIComponent(name)}`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(res.data);
}

if (!rawApiURL) {
  console.error(
    'BACKEND_ORIGIN is not set. Login and API calls will fail. ' +
    'Set BACKEND_ORIGIN in Frontend/.env (dev) or your hosting provider env vars (prod).'
  );
} else if (rawApiURL !== apiBaseURL) {
  console.warn(
    `[api] BACKEND_ORIGIN should end with /api. Normalized "${rawApiURL}" → "${apiBaseURL}".`
  );
}

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ff_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Tenant scoping header
  const tenantSlug = localStorage.getItem('ff_tenant_slug');
  if (tenantSlug) config.headers['X-Tenant-Slug'] = tenantSlug;

  config.headers['X-Request-Id'] = crypto.randomUUID().slice(0, 8);
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

    if (err.config?.url?.includes('/users/login')) {
      console.error('[api] Login response error', {
        status: err.response?.status,
        message: err.response?.data?.message,
        baseURL: err.config?.baseURL,
        requestId: err.response?.headers?.['x-request-id'] || err.config?.headers?.['X-Request-Id'],
      });
    }

    const code = err.response?.data?.code;
    const msg = err.response?.data?.message;

    if (err.response?.status === 403) {
      if (code === 'FEATURE_NOT_IN_PLAN') {
        toast.error(`Feature unavailable: ${msg || 'Upgrade your subscription plan to access this feature.'}`);
      } else if (code === 'PLAN_LIMIT_REACHED') {
        toast.error(`Limit reached: ${msg || 'Maximum limit reached for your current plan.'}`);
      } else if (code === 'TENANT_SUSPENDED') {
        toast.error('Your gym subscription is suspended. Please contact support.');
      } else if (code === 'SUBSCRIPTION_PAST_DUE') {
        toast.error('Subscription past due. Changes are disabled until payment is resolved.');
      } else if (code === 'ROLE_NOT_IN_PLAN') {
        toast.error('Role not permitted under your current plan.');
      }
    }

    if (err.response?.status === 401 && !err.config?.url?.includes('/users/login')) {
      localStorage.removeItem('ff_token');
      localStorage.removeItem('ff_user');
      toast.error('Session expired. Please sign in again.');
      // small delay so toast is visible before redirect
      setTimeout(() => { window.location.href = '/'; }, 1200);
    }
    return Promise.reject(err);
  }
);

export default api;
