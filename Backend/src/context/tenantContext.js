const { AsyncLocalStorage } = require("async_hooks");

const tenantStorage = new AsyncLocalStorage();

/**
 * Execute a function within the context of a specific tenant.
 * @param {{ tenantId: string, tenantSlug?: string }} context
 * @param {Function} fn
 */
function runWithTenant(context, fn) {
    if (!context || !context.tenantId) {
        throw new Error("runWithTenant requires a valid context containing tenantId");
    }
    const store = {
        tenantId: String(context.tenantId),
        tenantSlug: context.tenantSlug || null,
        isPlatform: false,
    };
    return tenantStorage.run(store, fn);
}

/**
 * Execute a function with platform-level privileges (bypassing tenant scoping).
 * Reserved strictly for platform administrative operations, migrations, and system schedulers.
 * Logs an audit event when possible.
 * @param {Function} fn
 * @param {{ actorId?: string, reason?: string }} [auditMeta]
 */
function runAsPlatform(fn, auditMeta = {}) {
    const store = {
        tenantId: null,
        tenantSlug: null,
        isPlatform: true,
        auditMeta,
    };

    // Lazily log platform escape hatch usage to avoid circular dependency
    try {
        const logger = require("../utils/logger");
        logger.info("platform", "runAsPlatform invoked", {
            actorId: auditMeta.actorId || "system",
            reason: auditMeta.reason || "unspecified",
        });
    } catch {
        // Logging failure should not disrupt critical platform operations
    }

    return tenantStorage.run(store, fn);
}

/**
 * Get current tenant context or null if none is active.
 */
function getTenantContext() {
    return tenantStorage.getStore() || null;
}

/**
 * Get current active tenantId string or null.
 */
function getTenantId() {
    const store = tenantStorage.getStore();
    return store?.tenantId || null;
}

/**
 * Check if the current context is running with platform privileges.
 */
function isPlatformContext() {
    const store = tenantStorage.getStore();
    return Boolean(store?.isPlatform);
}

module.exports = {
    runWithTenant,
    runAsPlatform,
    getTenantContext,
    getTenantId,
    isPlatformContext,
};
