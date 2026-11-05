const cacheService = require("../services/cacheService");

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
function buildCacheKey(req, scope = "auto") {
    const tenantId = req.user?.tenantId?.toString() || req.tenant?.id?.toString() || null;
    const userId = req.user?.id?.toString() || req.user?._id?.toString() || null;
    const role = req.user?.role || "anonymous";
    const path = (req.baseUrl || "") + (req.path || "");
    const queryString = normalizeQuery(req.query);
    const fullPath = queryString ? `${path}?${queryString}` : path;

    if (scope === "platform" || (!tenantId && req.platformUser)) {
        return `platform:${fullPath}`;
    }

    if (scope === "user" || (scope === "auto" && ["Sales", "Coach"].includes(role))) {
        return `tenant:${tenantId || "default"}:user:${userId || "anon"}:${role}:${fullPath}`;
    }

    // Role-scoped within tenant:
    return `tenant:${tenantId || "default"}:role:${role}:${fullPath}`;
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

/**
 * API Caching Middleware for Express routes.
 *
 * @param {Object} [options]
 * @param {number} [options.ttlSeconds=60] Time-to-live in seconds
 * @param {string[]|Function} [options.tags=[]] Invalidation tags
 * @param {"tenant"|"user"|"platform"|"public"} [options.scope="tenant"]
 * @param {Function} [options.condition] Optional filter function: (req) => boolean
 */
function cacheResponse(options = {}) {
    const ttlSeconds = options.ttlSeconds !== undefined ? options.ttlSeconds : 60;
    const rawTags = options.tags || [];
    const scope = options.scope || "auto";
    const condition = options.condition;

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
            // Check client ETag for conditional request (HTTP 304 Not Modified)
            const clientEtag = req.headers["if-none-match"];
            if (clientEtag && clientEtag === cached.etag) {
                res.setHeader("ETag", cached.etag);
                res.setHeader("Cache-Control", `private, max-age=${ttlSeconds}`);
                res.setHeader("X-Cache", "HIT");
                return res.status(304).end();
            }

            res.setHeader("ETag", cached.etag);
            res.setHeader("Cache-Control", `private, max-age=${ttlSeconds}`);
            res.setHeader("X-Cache", "HIT");
            res.setHeader("Content-Type", cached.contentType || "application/json");

            // Express send handles buffers/strings
            return res.status(200).send(cached.value);
        }

        res.setHeader("X-Cache", "MISS");

        // Intercept response to store successful responses
        const originalSend = res.send.bind(res);

        res.send = (body) => {
            // Restore original send to avoid duplicate interception
            res.send = originalSend;

            // Only cache successful responses (200 OK)
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
                    res.setHeader("Cache-Control", `private, max-age=${ttlSeconds}`);
                } catch {
                    // Caching errors should never fail the HTTP response
                }
            }

            return originalSend(body);
        };

        next();
    };
}

module.exports = {
    cacheResponse,
    buildCacheKey,
    resolveTags,
};
