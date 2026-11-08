const AUTH_TTL_MS = 30 * 1000;

/** @type {Map<string, { expiresAt: number, tenantId: string|null, user: object, tenant: object|null, plan: object|null, tenantSlug: string|null }>} */
const entries = new Map();

function cacheKey(userId, tenantId) {
    return `${String(userId)}:${tenantId ? String(tenantId) : "none"}`;
}

function plain(value) {
    if (value == null) return null;
    const raw = typeof value.toObject === "function" ? value.toObject() : value;
    return JSON.parse(JSON.stringify(raw));
}

function getAuthContext(userId, tenantId, now = Date.now()) {
    const hit = entries.get(cacheKey(userId, tenantId));
    if (!hit) return null;
    if (hit.expiresAt <= now) {
        entries.delete(cacheKey(userId, tenantId));
        return null;
    }
    return {
        user: plain(hit.user),
        tenant: plain(hit.tenant),
        plan: plain(hit.plan),
        tenantSlug: hit.tenantSlug,
    };
}

function setAuthContext(userId, tenantId, value, now = Date.now()) {
    const storedTenantId = value.tenantId ? String(value.tenantId) : (tenantId ? String(tenantId) : null);
    entries.set(cacheKey(userId, tenantId), {
        expiresAt: now + AUTH_TTL_MS,
        tenantId: storedTenantId,
        user: plain(value.user),
        tenant: plain(value.tenant),
        plan: plain(value.plan),
        tenantSlug: value.tenantSlug || null,
    });
}

function invalidateAuthContext({ userId, tenantId, all } = {}) {
    if (all) {
        entries.clear();
        return;
    }
    const user = userId ? String(userId) : null;
    const tenant = tenantId ? String(tenantId) : null;
    for (const [key, entry] of entries) {
        const matchesUser = user && (key.startsWith(`${user}:`) || entry.user?.id === user);
        const matchesTenant = tenant && entry.tenantId === tenant;
        if ((user && matchesUser) || (tenant && !user && matchesTenant)) {
            entries.delete(key);
        }
    }
}

function clearAuthContextCache() {
    entries.clear();
}

module.exports = {
    AUTH_TTL_MS,
    getAuthContext,
    setAuthContext,
    invalidateAuthContext,
    clearAuthContextCache,
};
