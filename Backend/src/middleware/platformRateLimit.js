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
    message: {
        message: "Too many login attempts from this IP. Please try again after 15 minutes.",
    },
});

module.exports = { platformAuthLimiter };
