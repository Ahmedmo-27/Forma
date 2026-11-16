/**
 * httpOnly session cookies for tenant + platform JWTs.
 * Prod: Domain=.<BASE_DOMAIN>, Secure, SameSite=Lax (app/api same-site subdomains).
 * Local: host-only (no Domain) — use Vite /api proxy so SPA and API share origin.
 */

const TENANT_COOKIE = "forma_tenant";
const PLATFORM_COOKIE = "forma_platform";
const PLATFORM_REFRESH_COOKIE = "forma_platform_refresh";

const TENANT_MAX_AGE_SEC = 8 * 60 * 60;
const PLATFORM_MAX_AGE_SEC = 60 * 60;
const PLATFORM_REFRESH_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function cookieBaseOptions() {
    const isProd = process.env.NODE_ENV === "production";
    const baseDomain = String(process.env.BASE_DOMAIN || "")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");

    const options = {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
    };

    if (isProd && baseDomain) {
        options.domain = `.${baseDomain}`;
    }

    return options;
}

function setCookie(res, name, value, maxAgeSec) {
    res.cookie(name, value, {
        ...cookieBaseOptions(),
        maxAge: maxAgeSec * 1000,
    });
}

function clearCookie(res, name) {
    res.clearCookie(name, {
        ...cookieBaseOptions(),
        maxAge: 0,
    });
}

function setTenantAuthCookie(res, token) {
    setCookie(res, TENANT_COOKIE, token, TENANT_MAX_AGE_SEC);
}

function clearTenantAuthCookie(res) {
    clearCookie(res, TENANT_COOKIE);
}

function setPlatformAuthCookies(res, { token, refreshToken }) {
    if (token) setCookie(res, PLATFORM_COOKIE, token, PLATFORM_MAX_AGE_SEC);
    if (refreshToken) {
        setCookie(res, PLATFORM_REFRESH_COOKIE, refreshToken, PLATFORM_REFRESH_MAX_AGE_SEC);
    }
}

function clearPlatformAuthCookies(res) {
    clearCookie(res, PLATFORM_COOKIE);
    clearCookie(res, PLATFORM_REFRESH_COOKIE);
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
