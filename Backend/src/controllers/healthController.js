const mongoose = require("mongoose");

const DB_STATUS = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

/**
 * Public liveness/readiness probe for load balancers (e.g. Render).
 * GET /health
 */
function getHealth(_req, res) {
    const readyState = mongoose.connection.readyState;
    const dbReady = readyState === 1;
    const payload = {
        status: dbReady ? "ok" : "degraded",
        database: DB_STATUS[readyState] || "unknown",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    };

    res.set("Cache-Control", "no-store");
    // While Mongo is still connecting, tell probes and proxies to retry shortly.
    if (!dbReady) res.set("Retry-After", "5");
    return res.status(dbReady ? 200 : 503).json(payload);
}

module.exports = { getHealth };
