/**
 * IP Allowlist Middleware for Platform Routes
 * If PLATFORM_IP_ALLOWLIST is defined in env, requests from other IPs are blocked with 403.
 * Supports comma-separated list of exact IPs (e.g. "127.0.0.1,::1,10.0.0.1").
 */
function platformIpAllowlist(req, res, next) {
    const rawAllowlist = process.env.PLATFORM_IP_ALLOWLIST;
    if (!rawAllowlist || !rawAllowlist.trim()) {
        return next();
    }

    const allowedIps = rawAllowlist
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean);

    const clientIp = (req.ip || req.connection?.remoteAddress || "").replace(/^.*:/, ""); // normalize IPv4-mapped IPv6

    const isAllowed = allowedIps.some((ip) => {
        const cleanAllowed = ip.replace(/^.*:/, "");
        return cleanAllowed === clientIp || ip === req.ip;
    });

    if (!isAllowed) {
        const message = "Access forbidden: IP address not authorized for platform administration";
        return res.status(403).json({
            error: {
                code: "AUTH_IP_NOT_ALLOWED",
                message,
                status: 403,
                requestId: req.requestId,
            },
            message,
        });
    }

    next();
}

module.exports = { platformIpAllowlist };
