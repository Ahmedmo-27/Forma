const rateLimit = require("express-rate-limit");

/** Limits multipart upload endpoints (photos, national IDs, invitation files). */
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        const message = "Too many uploads, try again later";
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

module.exports = uploadLimiter;
