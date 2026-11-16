const { requestUsesCookieAuth } = require("../utils/authCookies");

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function configuredOrigins() {
    return (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean);
}

function baseDomainOriginRe() {
    const baseDomain = String(process.env.BASE_DOMAIN || "")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");
    if (!baseDomain) return null;
    return new RegExp(`^https:\\/\\/([a-z0-9-]+\\.)?${baseDomain.replace(/\./g, "\\.")}$`, "i");
}

function isAllowedOrigin(origin) {
    if (!origin) return false;
    const clean = origin.replace(/\/+$/, "");
    const allow = configuredOrigins();
    if (allow.includes("*") || allow.includes(clean)) return true;
    const domainRe = baseDomainOriginRe();
    if (domainRe && domainRe.test(clean)) return true;
    if (/^https:\/\/(leap|forma)[a-z0-9-]*\.vercel\.app$/i.test(clean)) return true;
    if (/^http:\/\/localhost(:\d+)?$/i.test(clean)) return true;
    if (/^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(clean)) return true;
    return false;
}

function originFromRequest(req) {
    const origin = req.get("origin");
    if (origin) return origin;
    const referer = req.get("referer");
    if (!referer) return null;
    try {
        return new URL(referer).origin;
    } catch {
        return null;
    }
}

/**
 * When the browser authenticates via cookies (no Bearer), require Origin/Referer
 * to match the CORS allowlist on mutating requests.
 */
function csrfOrigin(req, res, next) {
    if (!MUTATING.has(String(req.method || "").toUpperCase())) return next();
    if (!requestUsesCookieAuth(req)) return next();

    const origin = originFromRequest(req);
    if (isAllowedOrigin(origin)) return next();

    return res.status(403).json({
        code: "CSRF_ORIGIN_DENIED",
        message: "Request origin is not allowed for cookie-authenticated mutations.",
    });
}

module.exports = {
    csrfOrigin,
    isAllowedOrigin,
    originFromRequest,
};
