/**
 * Browser error monitoring. Sentry is fetched as a separate chunk and only when
 * VITE_SENTRY_DSN is set; without it every call here is a no-op.
 *
 * Tracing + logs cover the Forma hosts (app / www / platform → api) via
 * browserTracingIntegration and tracePropagationTargets.
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

function resolveTracesSampleRate() {
  const raw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  // Local/dev: every trace for verification. Production builds: 10%.
  return import.meta.env.PROD ? 0.1 : 1.0;
}

function resolveTracePropagationTargets() {
  const targets = [
    "localhost",
    /^\//,
    /^https:\/\/([a-z0-9-]+\.)?forma-official\.com/i,
    /^https:\/\/[a-z0-9-]+\.onrender\.com/i,
    /^https:\/\/[a-z0-9-]+\.vercel\.app/i,
  ];
  const apiOrigin = String(import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (apiOrigin && /^https?:\/\//i.test(apiOrigin)) {
    targets.push(apiOrigin);
  }
  return targets;
}

export function initMonitoring() {
  if (!DSN || loading) return loading;
  const tracesSampleRate = resolveTracesSampleRate();
  loading = import("@sentry/react")
    .then((mod) => {
      const integrations = [mod.browserTracingIntegration()];
      if (typeof mod.consoleLoggingIntegration === "function") {
        // High-signal console only — avoid mirroring every log line.
        integrations.push(mod.consoleLoggingIntegration({ levels: ["warn", "error"] }));
      }
      mod.init({
        dsn: DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
        sendDefaultPii: false,
        enableLogs: true,
        tracesSampleRate,
        tracePropagationTargets: resolveTracePropagationTargets(),
        integrations,
        ignoreErrors: [
          "ResizeObserver loop limit exceeded",
          "ResizeObserver loop completed with undelivered notifications",
        ],
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

/** Structured browser log → Sentry Logs (linked to the active trace when present). */
export function captureLog(level, message, attributes = {}) {
  withSentry((s) => {
    if (!s.logger) return;
    const method = ["trace", "debug", "info", "warn", "error", "fatal"].includes(level) ? level : "info";
    s.logger[method](String(message), attributes);
  });
}
