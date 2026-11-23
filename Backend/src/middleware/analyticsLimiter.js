const rateLimit = require("express-rate-limit");
const { ANALYTICS_MAX, ANALYTICS_WINDOW_MS } = require("./rateLimitBudgets");
const { withRateLimitStore } = require("./rateLimitStore");

/** Stricter budget for /api/bi and /api/analytics (expensive aggregations). */
const analyticsLimiter = rateLimit(withRateLimitStore({
    windowMs: ANALYTICS_WINDOW_MS,
    max: ANALYTICS_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        const message = "Too many analytics requests, try again later";
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

module.exports = analyticsLimiter;
