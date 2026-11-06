const cacheService = require("../services/cacheService");

/** tenantId -> Set<function> */
const listeners = new Map();

function subscribeLive(tenantId, listener) {
    const key = String(tenantId || "");
    if (!key) return () => {};
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(listener);
    return () => {
        const set = listeners.get(key);
        if (!set) return;
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
    };
}

/**
 * Push a gym event to every open check-in screen for this tenant,
 * and drop cached check-in / member reads so the follow-up fetch is current.
 */
function publishLive(tenantId, event) {
    const key = String(tenantId || "");
    if (!key || !event) return;
    const tags = ["checkins", "members"].map((cat) => `tenant:${key}:${cat}`);
    try { cacheService.invalidateTags(tags); } catch { /* cache must not block the event */ }

    const payload = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        ...event,
    };
    const set = listeners.get(key);
    if (!set) return;
    for (const listener of set) {
        try { listener(payload); } catch { /* one dead client should not stop the rest */ }
    }
}

function liveStream(req, res) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
        return res.status(400).json({ message: "Tenant is required" });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);

    const unsubscribe = subscribeLive(tenantId, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => {
        res.write(": ping\n\n");
    }, 20000);

    req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
}

module.exports = { subscribeLive, publishLive, liveStream };
