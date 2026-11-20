/**
 * Browser error monitoring. Sentry is fetched as a separate chunk and only when
 * VITE_SENTRY_DSN is set; without it every call here is a no-op.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN;

let sentry = null;
let loading = null;
const pending = [];

function withSentry(fn) {
  if (!DSN) return;
  if (sentry) {
    fn(sentry);
    return;
  }
  pending.push(fn);
  initMonitoring();
}

export function initMonitoring() {
  if (!DSN || loading) return loading;
  loading = import("@sentry/react")
    .then((mod) => {
      mod.init({
        dsn: DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"],
        beforeSend(event) {
          if (event.request?.headers) {
            delete event.request.headers.Authorization;
            delete event.request.headers.Cookie;
          }
          return event;
        },
      });
      sentry = mod;
      while (pending.length) pending.shift()(mod);
      return mod;
    })
    .catch((error) => {
      console.warn("[monitoring] Sentry failed to load", error?.message);
      pending.length = 0;
      return null;
    });
  return loading;
}

/** Tag every future event with the signed-in user and tenant. Pass null on sign-out. */
export function setMonitoringUser(user) {
  withSentry((s) => {
    if (!user) {
      s.setUser(null);
      s.setTag("tenant_id", undefined);
      s.setTag("tenant_slug", undefined);
      return;
    }
    s.setUser({ id: String(user.id || user._id || ""), role: user.role || undefined });
    if (user.tenantId) s.setTag("tenant_id", String(user.tenantId));
    if (user.tenantSlug) s.setTag("tenant_slug", user.tenantSlug);
    s.setTag("surface", user.surface || "tenant");
  });
}

/** Remember the last failed API request id so a crash can be matched to backend logs. */
export function noteFailedRequest(requestId, status) {
  if (!requestId) return;
  withSentry((s) => {
    s.setTag("last_failed_request_id", requestId);
    s.addBreadcrumb({ category: "api", level: "warning", message: `API ${status || "error"}`, data: { requestId } });
  });
}

export function captureException(error, { tags, extra } = {}) {
  withSentry((s) => {
    s.withScope((scope) => {
      if (tags) scope.setTags(tags);
      if (extra) scope.setExtras(extra);
      s.captureException(error);
    });
  });
}
