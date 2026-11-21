/**
 * Detect SPA ↔ API cross-site requests (Vercel preview → Railway/Render).
 * Same-site prod (app.forma-official.com → api.forma-official.com) uses cookies.
 * Cross-site clients need SameSite=None cookies and/or Bearer tokens in the body.
 */

function baseDomain() {
    return String(process.env.BASE_DOMAIN || "")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");
}

function hostnameFromOrigin(origin) {
    if (!origin) return "";
    try {
        return new URL(origin).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function sharesRegistrableDomain(hostA, hostB) {
    if (!hostA || !hostB) return false;
    if (hostA === hostB) return true;
    const a = hostA.split(".").filter(Boolean);
    const b = hostB.split(".").filter(Boolean);
    if (a.length < 2 || b.length < 2) return false;
    return a.slice(-2).join(".") === b.slice(-2).join(".");
}

function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isCrossSiteAuthRequest(req) {
    const origin = req.get?.("origin") || req.headers?.origin || "";
    const originHost = hostnameFromOrigin(origin);
    if (!originHost) return false;
    if (isLocalHost(originHost)) return false;

    const domain = baseDomain();
    if (domain) {
        if (originHost === domain || originHost.endsWith(`.${domain}`)) {
            return false;
        }
        return true;
    }

    // No BASE_DOMAIN (Render testing): treat distinct vercel/render hosts as cross-site
    // unless Origin matches the API host exactly.
    const apiHost = hostnameFromOrigin(
        `${req.protocol}://${req.get?.("host") || req.headers?.host || ""}`
    );
    if (apiHost && sharesRegistrableDomain(originHost, apiHost)) return false;
    return originHost !== apiHost;
}

module.exports = {
    isCrossSiteAuthRequest,
    sharesRegistrableDomain,
    baseDomain,
};
