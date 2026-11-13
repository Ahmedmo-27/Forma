const rateLimit = require("express-rate-limit");

const WINDOW_MS = 15 * 60 * 1000;

function buildLimiter({ max, message }) {
    return rateLimit({
        windowMs: WINDOW_MS,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, _next, options) => {
            const retryAfter = Math.ceil(options.windowMs / 1000);
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
}

/** Strict limiter for POST /api/users/login — blocks credential stuffing. */
const loginLimiter = buildLimiter({
    max: 10,
    message: "Too many login attempts, try again in 15 minutes",
});

const forgotPasswordLimiter = buildLimiter({
    max: 5,
    message: "Too many password reset requests, try again in 15 minutes",
});

const setupPasswordLimiter = buildLimiter({
    max: 10,
    message: "Too many password setup attempts, try again in 15 minutes",
});

module.exports = loginLimiter;
module.exports.forgotPasswordLimiter = forgotPasswordLimiter;
module.exports.setupPasswordLimiter = setupPasswordLimiter;
