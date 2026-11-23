const logger = require("../utils/logger");

let store;
let client;
let initAttempted = false;

/**
 * Optional shared rate-limit store for multi-replica. When REDIS_URL is unset,
 * express-rate-limit uses its default in-memory store (correct only with replicas=1).
 */
function getRateLimitStore() {
    if (initAttempted) return store;
    initAttempted = true;

    const url = process.env.REDIS_URL;
    if (!url) {
        store = undefined;
        return store;
    }

    try {
        const { createClient } = require("redis");
        const { RedisStore } = require("rate-limit-redis");
        client = createClient({ url });
        client.on("error", (error) => {
            logger.warn("ratelimit", "Redis client error", { error: error.message });
        });
        client.connect().catch((error) => {
            logger.warn("ratelimit", "Redis connect failed; limiters may error until Redis recovers", {
                error: error.message,
            });
        });
        store = new RedisStore({
            sendCommand: (...args) => client.sendCommand(args),
            prefix: "forma:rl:",
        });
        logger.info("ratelimit", "Using Redis rate-limit store");
    } catch (error) {
        logger.warn("ratelimit", "Redis rate-limit store unavailable; falling back to memory", {
            error: error.message,
        });
        store = undefined;
    }

    return store;
}

function withRateLimitStore(options = {}) {
    const shared = getRateLimitStore();
    if (!shared) return options;
    return { ...options, store: shared };
}

function isSharedRateLimitEnabled() {
    return Boolean(getRateLimitStore());
}

module.exports = {
    getRateLimitStore,
    withRateLimitStore,
    isSharedRateLimitEnabled,
};
