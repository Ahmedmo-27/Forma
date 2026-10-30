const rateLimit = require("express-rate-limit");

/** Strict limiter for POST /api/users/login — blocks credential stuffing. */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts, try again in 15 minutes" },
});

module.exports = loginLimiter;
