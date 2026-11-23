const rateLimit = require("express-rate-limit");
const { withRateLimitStore } = require("./rateLimitStore");

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = {
    login: 10,
    forgotPassword: 5,
    setupPassword: 10,
};

function buildLimiter({ max, message }) {
    return rateLimit(withRateLimitStore({
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
    }));
}

/** Strict limiter for POST /api/users/login — blocks credential stuffing. */
const loginLimiter = buildLimiter({
    max: LIMITS.login,
    message: "Too many login attempts, try again in 15 minutes",
});

const forgotPasswordLimiter = buildLimiter({
    max: LIMITS.forgotPassword,
    message: "Too many password reset requests, try again in 15 minutes",
});

const setupPasswordLimiter = buildLimiter({
    max: LIMITS.setupPassword,
    message: "Too many password setup attempts, try again in 15 minutes",
});

module.exports = loginLimiter;
module.exports.forgotPasswordLimiter = forgotPasswordLimiter;
module.exports.setupPasswordLimiter = setupPasswordLimiter;
module.exports.WINDOW_MS = WINDOW_MS;
module.exports.LIMITS = LIMITS;
