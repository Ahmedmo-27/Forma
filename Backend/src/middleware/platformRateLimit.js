const rateLimit = require("express-rate-limit");

/**
 * Strict rate limiter for platform authentication endpoints.
 * 15 requests per 15 minutes window per IP.
 */
const platformAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
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
});

module.exports = { platformAuthLimiter };
