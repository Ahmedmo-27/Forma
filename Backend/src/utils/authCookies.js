/**
 * httpOnly session cookies for tenant + platform JWTs.
 * Prod + BASE_DOMAIN (same-site app/api): Domain=.<BASE_DOMAIN>, Secure, SameSite=Lax.
 * Cross-site (Vercel preview → API, or prod without BASE_DOMAIN): host-only, Secure,
 *   SameSite=None so credentialed XHR can store/send the cookie (Chrome). Safari ITP
 *   may still block — clients also receive a Bearer token in the login JSON body.
 * Local: host-only, SameSite=Lax — use Vite /api proxy so SPA and API share origin.
 */

const TENANT_COOKIE = "forma_tenant";
const PLATFORM_COOKIE = "forma_platform";
const PLATFORM_REFRESH_COOKIE = "forma_platform_refresh";

const TENANT_MAX_AGE_SEC = 8 * 60 * 60;
const PLATFORM_MAX_AGE_SEC = 60 * 60;
const PLATFORM_REFRESH_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function cookieBaseOptions({ crossSite = false } = {}) {
    const isProd = process.env.NODE_ENV === "production";
    const baseDomain = String(process.env.BASE_DOMAIN || "")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");

    // Cross-site clients cannot use Lax + Domain=.<BASE_DOMAIN>.
    const useCrossSite = crossSite || (isProd && !baseDomain);
    const sameSite = useCrossSite ? "none" : "lax";

    const options = {
        httpOnly: true,
        // SameSite=None requires Secure; use Secure whenever we emit None.
        secure: isProd || useCrossSite,
        sameSite,
        path: "/",
    };

    if (isProd && baseDomain && !useCrossSite) {
        options.domain = `.${baseDomain}`;
    }

    return options;
}

function setCookie(res, name, value, maxAgeSec, options = {}) {
    res.cookie(name, value, {
        ...cookieBaseOptions(options),
        maxAge: maxAgeSec * 1000,
    });
}

function clearCookie(res, name, options = {}) {
    res.clearCookie(name, {
        ...cookieBaseOptions(options),
        maxAge: 0,
    });
}

function setTenantAuthCookie(res, token, options = {}) {
    setCookie(res, TENANT_COOKIE, token, TENANT_MAX_AGE_SEC, options);
}

function clearTenantAuthCookie(res, options = {}) {
    clearCookie(res, TENANT_COOKIE, options);
}

function setPlatformAuthCookies(res, { token, refreshToken }, options = {}) {
    if (token) setCookie(res, PLATFORM_COOKIE, token, PLATFORM_MAX_AGE_SEC, options);
    if (refreshToken) {
        setCookie(res, PLATFORM_REFRESH_COOKIE, refreshToken, PLATFORM_REFRESH_MAX_AGE_SEC, options);
    }
}

function clearPlatformAuthCookies(res, options = {}) {
    clearCookie(res, PLATFORM_COOKIE, options);
    clearCookie(res, PLATFORM_REFRESH_COOKIE, options);
}

function readBearer(req) {
    const header = req.headers?.authorization || "";
    if (header.startsWith("Bearer ")) return header.slice(7).trim() || null;
    return null;
}

function readTenantToken(req) {
    return readBearer(req) || req.cookies?.[TENANT_COOKIE] || null;
}

function readPlatformToken(req) {
    return readBearer(req) || req.cookies?.[PLATFORM_COOKIE] || null;
}

function readPlatformRefreshToken(req) {
    const bodyToken = req.body?.refreshToken;
    if (typeof bodyToken === "string" && bodyToken.trim()) return bodyToken.trim();
    return req.cookies?.[PLATFORM_REFRESH_COOKIE] || null;
}

function requestUsesCookieAuth(req) {
    const hasCookie =
        Boolean(req.cookies?.[TENANT_COOKIE]) ||
        Boolean(req.cookies?.[PLATFORM_COOKIE]) ||
        Boolean(req.cookies?.[PLATFORM_REFRESH_COOKIE]);
    return hasCookie && !readBearer(req);
}

module.exports = {
    TENANT_COOKIE,
    PLATFORM_COOKIE,
    PLATFORM_REFRESH_COOKIE,
    TENANT_MAX_AGE_SEC,
    PLATFORM_MAX_AGE_SEC,
    PLATFORM_REFRESH_MAX_AGE_SEC,
    setTenantAuthCookie,
    clearTenantAuthCookie,
    setPlatformAuthCookies,
    clearPlatformAuthCookies,
    readTenantToken,
    readPlatformToken,
    readPlatformRefreshToken,
    requestUsesCookieAuth,
};
