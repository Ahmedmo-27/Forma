const logger = require("../utils/logger");
const { sanitizeForLog } = require("../utils/sanitizeLog");

/**
 * Error monitoring facade. Sentry is loaded only when SENTRY_DSN is set, so
 * local, test, and unconfigured environments pay nothing and send nothing.
 */
let sentry = null;
let initialized = false;

function init() {
    if (initialized) return sentry;
    initialized = true;
    const dsn = process.env.SENTRY_DSN;
    if (!dsn || process.env.NODE_ENV === "test") return null;
    try {
        sentry = require("@sentry/node");
        sentry.init({
            dsn,
            environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
            release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || undefined,
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
            sendDefaultPii: false,
            beforeSend(event) {
                if (event.request) {
                    delete event.request.cookies;
                    delete event.request.data;
                    if (event.request.headers) {
                        delete event.request.headers.authorization;
                        delete event.request.headers.cookie;
                    }
                }
                return event;
            },
        });
        logger.info("monitoring", "Sentry enabled", { environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV });
    } catch (error) {
        logger.warn("monitoring", "Sentry could not be initialised", { error: error.message });
        sentry = null;
    }
    return sentry;
}

function isEnabled() {
    return Boolean(init());
}

/** Tags and user for an Express request: tenant, request id, route, actor. */
function contextFromRequest(req) {
    if (!req) return {};
    const tenantId = req.user?.tenantId || req.tenant?._id || null;
    const actor = req.user || req.platformUser || null;
    return {
        requestId: req.requestId || null,
        tenantId: tenantId ? String(tenantId) : null,
        user: actor?.id ? { id: String(actor.id), role: actor.role || null } : null,
        tags: {
            method: req.method,
            route: String(req.originalUrl || req.url || "").split("?")[0],
            surface: req.platformUser ? "platform" : "tenant",
        },
    };
}

function applyScope(scope, { tags, extra, requestId, tenantId, user } = {}) {
    if (tags) scope.setTags(tags);
    if (requestId) scope.setTag("request_id", requestId);
    if (tenantId) scope.setTag("tenant_id", String(tenantId));
    if (user?.id) scope.setUser({ id: String(user.id), role: user.role || undefined });
    if (extra) scope.setExtras(sanitizeForLog(extra));
}

function captureException(error, context = {}) {
    const client = init();
    if (!client) return;
    try {
        client.withScope((scope) => {
            applyScope(scope, context);
            client.captureException(error instanceof Error ? error : new Error(String(error)));
        });
    } catch (err) {
        logger.warn("monitoring", "Sentry capture failed", { error: err.message });
    }
}

function captureMessage(message, level = "warning", context = {}) {
    const client = init();
    if (!client) return;
    try {
        client.withScope((scope) => {
            applyScope(scope, context);
            scope.setLevel(level);
            client.captureMessage(message);
        });
    } catch (err) {
        logger.warn("monitoring", "Sentry capture failed", { error: err.message });
    }
}

async function flush(timeoutMs = 2000) {
    if (!sentry) return;
    try {
        await sentry.flush(timeoutMs);
    } catch {
        // Shutdown must not hang on monitoring.
    }
}

module.exports = { init, isEnabled, captureException, captureMessage, contextFromRequest, flush };
