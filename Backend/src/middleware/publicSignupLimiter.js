const rateLimit = require("express-rate-limit");
const { PUBLIC_SIGNUP_MAX, PUBLIC_SIGNUP_WINDOW_MS } = require("./rateLimitBudgets");

/** Strict limiter for POST /api/public/signup — blocks signup spam. */
const publicSignupLimiter = rateLimit({
    windowMs: PUBLIC_SIGNUP_WINDOW_MS,
    max: PUBLIC_SIGNUP_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        const message = "Too many signup attempts, try again in 15 minutes";
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

module.exports = publicSignupLimiter;
