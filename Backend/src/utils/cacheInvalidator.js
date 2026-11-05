const cacheService = require("../services/cacheService");
const logger = require("./logger");

/**
 * Invalidate cache tags for a specific tenant.
 * @param {string|mongoose.Types.ObjectId} tenantId
 * @param {...string} categories e.g. "members", "revenue", "checkins", "contracts", "packages", "users"
 * @returns {number} number of keys evicted
 */
function invalidateTenantCache(tenantId, ...categories) {
    if (!tenantId) return 0;
    const cleanTenantId = tenantId.toString();
    const tags = categories.map((cat) => `tenant:${cleanTenantId}:${cat}`);
    return cacheService.invalidateTags(tags);
}

/**
 * Invalidate platform-level cache tags.
 * @param {...string} categories e.g. "analytics", "tenants", "plans", "system"
 * @returns {number} number of keys evicted
 */
function invalidatePlatformCache(...categories) {
    const tags = categories.map((cat) => `platform:${cat}`);
    return cacheService.invalidateTags(tags);
}

/**
 * Express middleware that invalidates tenant or platform cache tags upon successful completion
 * of mutation requests (status code 200..299).
 *
 * @param {string[]|Function} categories Categories to invalidate
 * @param {"tenant"|"platform"} [scope="tenant"]
 */
function autoInvalidate(categories, scope = "tenant") {
    return (req, res, next) => {
        const originalEnd = res.end.bind(res);

        res.end = function (...args) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const resolvedCats = typeof categories === "function" ? categories(req) : categories;
                    const catList = Array.isArray(resolvedCats) ? resolvedCats : [resolvedCats];

                    if (scope === "platform") {
                        invalidatePlatformCache(...catList);
                    } else {
                        const tenantId = req.user?.tenantId || req.tenant?.id;
                        if (tenantId) {
                            invalidateTenantCache(tenantId, ...catList);
                        }
                    }
                } catch (err) {
                    logger.warn("cache", "autoInvalidate error", { error: err.message });
                }
            }
            return originalEnd.apply(this, args);
        };

        next();
    };
}

module.exports = {
    invalidateTenantCache,
    invalidatePlatformCache,
    autoInvalidate,
};
