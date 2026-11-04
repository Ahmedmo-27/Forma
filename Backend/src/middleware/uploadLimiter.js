const rateLimit = require("express-rate-limit");

/** Limits multipart upload endpoints (photos, national IDs, invitation files). */
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many uploads, try again later" },
});

module.exports = uploadLimiter;
