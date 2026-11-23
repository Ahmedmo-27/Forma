const cacheService = require("../services/cacheService");

/** @type {Map<string, { promise: Promise<any>, resolve: (v: any) => void }>} */
const inflight = new Map();

/**
 * Normalizes query string for deterministic cache key generation.
 * @param {Object} query
 * @returns {string}
 */
function normalizeQuery(query) {
    if (!query || typeof query !== "object") return "";
    const keys = Object.keys(query).sort();
    if (keys.length === 0) return "";
    const parts = [];
    for (const key of keys) {
        const val = query[key];
        if (val !== undefined && val !== null && val !== "") {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
        }
    }
    return parts.join("&");
}

/**
 * Build tenant/role/user-scoped cache key.
 */
function locationCacheSegment(req) {
    const fromScope = req.locationScope?.selected;
    const fromHeader = req.headers?.["x-location-id"];
    const raw = fromScope != null && fromScope !== ""
        ? String(fromScope)
        : (fromHeader != null && fromHeader !== "" ? String(fromHeader) : "all");
    return `loc:${raw}`;
}

function buildCacheKey(req, scope = "auto") {
    const tenantId = req.user?.tenantId?.toString() || req.tenant?.id?.toString() || null;
    const userId = req.user?.id?.toString() || req.user?._id?.toString() || null;
    const role = req.user?.role || "anonymous";
    const path = (req.baseUrl || "") + (req.path || "");
    const queryString = normalizeQuery(req.query);
    const fullPath = queryString ? `${path}?${queryString}` : path;
    const loc = locationCacheSegment(req);

    if (scope === "platform" || (!tenantId && req.platformUser)) {
        return `platform:${loc}:${fullPath}`;
    }

    if (scope === "user" || (scope === "auto" && ["Sales", "Coach"].includes(role))) {
        return `tenant:${tenantId || "default"}:user:${userId || "anon"}:${role}:${loc}:${fullPath}`;
    }

    // Role-scoped within tenant:
    return `tenant:${tenantId || "default"}:role:${role}:${loc}:${fullPath}`;
}

/**
 * Resolve tags scoped to the current tenant or platform context.
 */
function resolveTags(rawTags, req) {
    const tenantId = req.user?.tenantId?.toString() || req.tenant?.id?.toString() || null;
    const tags = typeof rawTags === "function" ? rawTags(req) : rawTags;
    if (!Array.isArray(tags)) return [];

    return tags.map((t) => {
        if (t.startsWith("tenant:") || t.startsWith("platform:")) {
            return t;
        }
        return tenantId ? `tenant:${tenantId}:${t}` : `platform:${t}`;
    });
}

function sendCached(req, res, cached, cacheControl, cacheStatus) {
    const clientEtag = req.headers?.["if-none-match"];
    if (clientEtag && clientEtag === cached.etag) {
        res.setHeader("ETag", cached.etag);
        res.setHeader("Cache-Control", cacheControl);
        res.setHeader("X-Cache", cacheStatus);
        return res.status(304).end();
    }

    res.setHeader("ETag", cached.etag);
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("X-Cache", cacheStatus);
    res.setHeader("Content-Type", cached.contentType || "application/json");
    return res.status(200).send(cached.value);
}

/**
 * API Caching Middleware for Express routes.
 *
 * Concurrent MISS for the same key coalesce onto one handler (singleflight).
 *
 * @param {Object} [options]
 * @param {number} [options.ttlSeconds=60] Time-to-live in seconds
 * @param {string[]|Function} [options.tags=[]] Invalidation tags
 * @param {"tenant"|"user"|"platform"|"public"} [options.scope="tenant"]
 * @param {boolean} [options.browserCache=false] Opt in to Cache-Control max-age. Default is no-store.
 * @param {Function} [options.condition] Optional filter function: (req) => boolean
 */
function cacheResponse(options = {}) {
    const ttlSeconds = options.ttlSeconds !== undefined ? options.ttlSeconds : 60;
    const rawTags = options.tags || [];
    const scope = options.scope || "auto";
    const condition = options.condition;
    // Never let the browser reuse list responses. Server memory cache still
    // applies; a saved package or new member would otherwise stay invisible
    // until max-age expired (members 60s, packages 5min).
    const cacheControl = options.browserCache === true
        ? `private, max-age=${ttlSeconds}`
        : "private, no-store";

    return (req, res, next) => {
        // Only GET requests are cacheable
        if (req.method !== "GET") {
            return next();
        }

        // Check if cache bypass is explicitly requested
        if (
            req.headers["x-cache-bypass"] === "true" ||
            req.headers["cache-control"] === "no-cache" ||
            req.headers["pragma"] === "no-cache"
        ) {
            res.setHeader("X-Cache", "BYPASS");
            return next();
        }

        // Check optional custom condition
        if (typeof condition === "function" && !condition(req)) {
            return next();
        }

        const cacheKey = buildCacheKey(req, scope);
        const cached = cacheService.get(cacheKey);

        if (cached) {
            return sendCached(req, res, cached, cacheControl, "HIT");
        }

        const pending = inflight.get(cacheKey);
        if (pending) {
            return pending.promise.then((shared) => {
                if (res.headersSent) return undefined;
                if (shared) {
                    return sendCached(req, res, shared, cacheControl, "HIT");
                }
                // Leader failed to populate cache — run our own handler.
                res.setHeader("X-Cache", "MISS");
                return next();
            }).catch(() => {
                if (!res.headersSent) {
                    res.setHeader("X-Cache", "MISS");
                    next();
                }
            });
        }

        let settled = false;
        let resolveInflight;
        const promise = new Promise((resolve) => {
            resolveInflight = resolve;
        });
        inflight.set(cacheKey, { promise, resolve: resolveInflight });

        const settle = (value) => {
            if (settled) return;
            settled = true;
            resolveInflight(value);
            inflight.delete(cacheKey);
        };

        res.setHeader("X-Cache", "MISS");

        const originalSend = res.send.bind(res);

        res.send = (body) => {
            res.send = originalSend;

            let shared = null;
            if (res.statusCode >= 200 && res.statusCode < 300 && body !== undefined && body !== null) {
                try {
                    const scopedTags = resolveTags(rawTags, req);
                    const contentType = res.getHeader("content-type") || "application/json; charset=utf-8";

                    const etag = cacheService.set(cacheKey, body, {
                        ttlSeconds,
                        tags: scopedTags,
                        contentType: String(contentType),
                    });

                    res.setHeader("ETag", etag);
                    res.setHeader("Cache-Control", cacheControl);
                    shared = cacheService.get(cacheKey);
                } catch {
                    // Caching errors should never fail the HTTP response
                }
            }

            settle(shared);
            return originalSend(body);
        };

        const onDone = () => {
            settle(cacheService.get(cacheKey));
        };
        if (typeof res.on === "function") {
            res.on("finish", onDone);
            res.on("close", onDone);
        }

        next();
    };
}

module.exports = {
    cacheResponse,
    buildCacheKey,
    resolveTags,
    /** @internal test helper */
    _inflight: inflight,
};
