const rateLimit = require("express-rate-limit");
const { withRateLimitStore } = require("./rateLimitStore");

/**
 * Strict rate limiter for platform authentication endpoints.
 * 15 requests per 15 minutes window per IP.
 */
const PLATFORM_AUTH_WINDOW_MS = 15 * 60 * 1000;
const PLATFORM_AUTH_LIMIT = 15;

const platformAuthLimiter = rateLimit(withRateLimitStore({
    windowMs: PLATFORM_AUTH_WINDOW_MS,
    limit: PLATFORM_AUTH_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        const message = "Too many login attempts from this IP. Please try again after 15 minutes.";
        res.status(429).json({
            error: {
                code: "RATE_LIMITED",
                message,
                status: 429,
                requestId: req.requestId,
                retryAfter,
            },
            code: "RATE_LIMITED",
            message,
            retryAfter,
        });
    },
}));

module.exports = {
    platformAuthLimiter,
    PLATFORM_AUTH_WINDOW_MS,
    PLATFORM_AUTH_LIMIT,
};
