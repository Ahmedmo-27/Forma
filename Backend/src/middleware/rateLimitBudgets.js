/**
 * Documented rate-limit budgets (checklist §6.1, §7.1, §12.7).
 * Keep limiter `max` values in sync with these constants.
 */
module.exports = {
    GLOBAL_API_MAX: 600,
    GLOBAL_WINDOW_MS: 15 * 60 * 1000,
    PUBLIC_SIGNUP_MAX: 10,
    PUBLIC_SIGNUP_WINDOW_MS: 15 * 60 * 1000,
    UPLOAD_WRITE_MAX: 10,
    UPLOAD_WRITE_WINDOW_MS: 15 * 60 * 1000,
    UPLOAD_READ_MAX: 300,
    UPLOAD_READ_WINDOW_MS: 15 * 60 * 1000,
    /** Heavy BI / exec analytics (per IP). */
    ANALYTICS_MAX: 120,
    ANALYTICS_WINDOW_MS: 15 * 60 * 1000,
};
