const jwt = require("jsonwebtoken");
const PlatformUser = require("../models/PlatformUser");
const { runAsPlatform } = require("../context/tenantContext");

const PLATFORM_AUDIENCE = "leap-platform";
const PLATFORM_ISSUER = "leap-platform";

function getPlatformSecret() {
    if (process.env.PLATFORM_JWT_SECRET) {
        return process.env.PLATFORM_JWT_SECRET;
    }
    // Tests only — never fall back to a hardcoded production secret.
    if (process.env.NODE_ENV === "test") {
        return "test_platform_secret_123";
    }
    return null;
}

/**
 * Protect middleware strictly for Platform Users.
 * Enforces dedicated JWT audience, issuer, and secret.
 * Checks account status and session revocation (tokenVersion).
 * Automatically wraps downstream execution in runAsPlatform().
 */
async function protectPlatform(req, res, next) {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Platform authentication required: no token provided" });
    }

    const secret = getPlatformSecret();
    if (!secret) {
        return res.status(500).json({ message: "Platform JWT configuration missing (PLATFORM_JWT_SECRET)" });
    }

    try {
        const decoded = jwt.verify(token, secret, {
            audience: PLATFORM_AUDIENCE,
            issuer: PLATFORM_ISSUER,
        });

        const user = await PlatformUser.findById(decoded.id).select("-password");
        if (!user || user.status !== "active") {
            return res.status(401).json({ message: "Platform user account not found or disabled" });
        }

        // Verify token version (session revocation check)
        if (decoded.version != null && user.tokenVersion != null && decoded.version < user.tokenVersion) {
            return res.status(401).json({ message: "Platform session has been revoked. Please sign in again." });
        }

        req.platformUser = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
        };
        // Backwards compatibility for existing platform handlers
        req.platformAdmin = req.platformUser;

        // Wrap execution in platform context
        runAsPlatform(
            () => {
                next();
            },
            {
                actorId: user._id.toString(),
                reason: `platform_api_${req.method}_${req.baseUrl || ""}${req.path || ""}`,
            }
        );
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired platform administration token" });
    }
}

module.exports = {
    protectPlatform,
    PLATFORM_AUDIENCE,
    PLATFORM_ISSUER,
    getPlatformSecret,
};
