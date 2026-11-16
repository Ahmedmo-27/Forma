/**
 * httpOnly session cookies for tenant + platform JWTs.
 * Prod: Domain=.<BASE_DOMAIN>, Secure, SameSite=Lax (app/api same-site subdomains).
 * Local: host-only (no Domain) — use Vite /api proxy so SPA and API share origin.
 *
 * Always clear both host-only and Domain variants when rotating cookies so a stale
 * empty/non-JWT cookie cannot win over a freshly set session JWT.
 */

const TENANT_COOKIE = "forma_tenant";
const PLATFORM_COOKIE = "forma_platform";
const PLATFORM_REFRESH_COOKIE = "forma_platform_refresh";

const TENANT_MAX_AGE_SEC = 8 * 60 * 60;
const PLATFORM_MAX_AGE_SEC = 60 * 60;
const PLATFORM_REFRESH_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function normalizeBaseDomain(raw) {
    let value = String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");
    value = value.replace(/^https?:\/\//, "");
    value = value.split("/")[0].split(":")[0];
    if (value.startsWith("www.")) value = value.slice(4);
    return value;
}

function cookieBaseOptions({ withDomain = true } = {}) {
    const isProd = process.env.NODE_ENV === "production";
    const baseDomain = normalizeBaseDomain(process.env.BASE_DOMAIN);

    const options = {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
    };

    if (withDomain && isProd && baseDomain) {
        options.domain = `.${baseDomain}`;
    }

    return options;
}

function setCookie(res, name, value, maxAgeSec) {
    res.cookie(name, value, {
        ...cookieBaseOptions({ withDomain: true }),
        maxAge: maxAgeSec * 1000,
    });
}

function clearCookieVariants(res, name) {
    if (typeof res?.clearCookie !== "function") return;
    // Host-only (no Domain) — covers earlier deploys / misconfigured BASE_DOMAIN.
    res.clearCookie(name, {
        ...cookieBaseOptions({ withDomain: false }),
        maxAge: 0,
    });
    // Domain cookie used in production when BASE_DOMAIN is set.
    const withDomain = cookieBaseOptions({ withDomain: true });
    if (withDomain.domain) {
        res.clearCookie(name, {
            ...withDomain,
            maxAge: 0,
        });
    }
}

function setTenantAuthCookie(res, token) {
    clearCookieVariants(res, TENANT_COOKIE);
    setCookie(res, TENANT_COOKIE, token, TENANT_MAX_AGE_SEC);
}

function clearTenantAuthCookie(res) {
    clearCookieVariants(res, TENANT_COOKIE);
}

function setPlatformAuthCookies(res, { token, refreshToken }) {
    if (token) {
        clearCookieVariants(res, PLATFORM_COOKIE);
        setCookie(res, PLATFORM_COOKIE, token, PLATFORM_MAX_AGE_SEC);
    }
    if (refreshToken) {
        clearCookieVariants(res, PLATFORM_REFRESH_COOKIE);
        setCookie(res, PLATFORM_REFRESH_COOKIE, refreshToken, PLATFORM_REFRESH_MAX_AGE_SEC);
    }
}

function clearPlatformAuthCookies(res) {
    clearCookieVariants(res, PLATFORM_COOKIE);
    clearCookieVariants(res, PLATFORM_REFRESH_COOKIE);
}

function readBearer(req) {
    const header = req.headers?.authorization || "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7).trim();
    // Stale SPA builds stored localStorage ff_token=String(undefined) after cookie migration.
    if (!token || token === "undefined" || token === "null") return null;
    return token;
}

function looksLikeJwt(token) {
    if (!token || typeof token !== "string") return false;
    const parts = token.trim().split(".");
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

function decodeCookieValue(raw) {
    if (raw == null) return null;
    let value = String(raw).trim();
    if (!value) return null;
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }
    try {
        value = decodeURIComponent(value);
    } catch {
        // keep raw value if it wasn't URI-encoded
    }
    return value || null;
}

function cookieValuesFromHeader(cookieHeader, name) {
    if (!cookieHeader || typeof cookieHeader !== "string") return [];
    const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`, "gi");
    const values = [];
    let match;
    while ((match = re.exec(cookieHeader)) !== null) {
        const decoded = decodeCookieValue(match[1]);
        if (decoded) values.push(decoded);
    }
    return values;
}

function pickJwtToken(...candidates) {
    for (const candidate of candidates) {
        if (looksLikeJwt(candidate)) return candidate.trim();
    }
    for (const candidate of candidates) {
        if (candidate && typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return null;
}

function readTenantToken(req) {
    const bearer = readBearer(req);
    const parsed = decodeCookieValue(req.cookies?.[TENANT_COOKIE]);
    const fromHeader = cookieValuesFromHeader(req.headers?.cookie, TENANT_COOKIE);
    return pickJwtToken(bearer, parsed, ...fromHeader);
}

function readPlatformToken(req) {
    const bearer = readBearer(req);
    const parsed = decodeCookieValue(req.cookies?.[PLATFORM_COOKIE]);
    const fromHeader = cookieValuesFromHeader(req.headers?.cookie, PLATFORM_COOKIE);
    return pickJwtToken(bearer, parsed, ...fromHeader);
}

function readPlatformRefreshToken(req) {
    const bodyToken = req.body?.refreshToken;
    if (typeof bodyToken === "string" && bodyToken.trim()) return bodyToken.trim();
    const parsed = decodeCookieValue(req.cookies?.[PLATFORM_REFRESH_COOKIE]);
    const fromHeader = cookieValuesFromHeader(req.headers?.cookie, PLATFORM_REFRESH_COOKIE);
    return pickJwtToken(parsed, ...fromHeader);
}

function requestUsesCookieAuth(req) {
    const hasCookie =
        Boolean(req.cookies?.[TENANT_COOKIE]) ||
        Boolean(req.cookies?.[PLATFORM_COOKIE]) ||
        Boolean(req.cookies?.[PLATFORM_REFRESH_COOKIE]) ||
        cookieValuesFromHeader(req.headers?.cookie, TENANT_COOKIE).length > 0 ||
        cookieValuesFromHeader(req.headers?.cookie, PLATFORM_COOKIE).length > 0 ||
        cookieValuesFromHeader(req.headers?.cookie, PLATFORM_REFRESH_COOKIE).length > 0;
    return hasCookie && !readBearer(req);
}

function describeAuthToken(req) {
    const bearer = readBearer(req);
    const cookieVals = cookieValuesFromHeader(req.headers?.cookie, TENANT_COOKIE);
    const parsed = decodeCookieValue(req.cookies?.[TENANT_COOKIE]);
    const token = readTenantToken(req);
    let source = "none";
    if (token && looksLikeJwt(bearer) && token === bearer.trim()) source = "bearer";
    else if (token && (token === parsed || cookieVals.includes(token))) source = "cookie";
    else if (bearer) source = "bearer";
    else if (parsed || cookieVals.length) source = "cookie";

    return {
        source,
        hasBearer: Boolean(bearer),
        cookieCount: cookieVals.length || (parsed ? 1 : 0),
        tokenLength: token ? token.length : 0,
        tokenParts: token ? token.split(".").length : 0,
        looksLikeJwt: looksLikeJwt(token),
    };
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
    looksLikeJwt,
    describeAuthToken,
    normalizeBaseDomain,
};
