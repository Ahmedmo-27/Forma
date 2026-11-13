const jwt = require("jsonwebtoken");
const PlatformUser = require("../models/PlatformUser");
const { verifyPassword, normalizeEmail } = require("../utils/passwordUtils");
const {
    PLATFORM_AUDIENCE,
    PLATFORM_ISSUER,
    getPlatformSecret,
} = require("../middleware/platformAuth");
const { getPermissionsForRole } = require("../config/platformPermissions");
const logger = require("../utils/logger");

const REFRESH_AUDIENCE = "leap-platform-refresh";

function generateTokens(user) {
    const secret = getPlatformSecret();
    const token = jwt.sign(
        {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            version: user.tokenVersion || 0,
        },
        secret,
        {
            audience: PLATFORM_AUDIENCE,
            issuer: PLATFORM_ISSUER,
            expiresIn: "1h",
        }
    );

    const refreshToken = jwt.sign(
        {
            id: user._id.toString(),
            version: user.tokenVersion || 0,
        },
        secret,
        {
            audience: REFRESH_AUDIENCE,
            issuer: PLATFORM_ISSUER,
            expiresIn: "7d",
        }
    );

    return { token, refreshToken };
}

/**
 * Platform User Login
 * POST /api/platform/auth/login
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const normalized = normalizeEmail(email);
        const user = await PlatformUser.findOne({ email: normalized });

        if (!user) {
            const message = "Invalid credentials";
            return res.status(401).json({
                error: {
                    code: "AUTH_INVALID_CREDENTIALS",
                    message,
                    status: 401,
                    requestId: req.requestId,
                },
                message,
                code: "AUTH_INVALID_CREDENTIALS",
            });
        }

        if (user.status !== "active") {
            const message = "Account is disabled. Contact super admin.";
            return res.status(401).json({
                error: {
                    code: "AUTH_INVALID_CREDENTIALS",
                    message,
                    status: 401,
                    requestId: req.requestId,
                },
                message,
                code: "AUTH_INVALID_CREDENTIALS",
            });
        }

        // Lockout verification
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const retryAfter = Math.max(1, Math.ceil((user.lockedUntil - new Date()) / 1000));
            const minutesLeft = Math.ceil(retryAfter / 60);
            const message = `Account is temporarily locked due to multiple failed login attempts. Try again in ${minutesLeft} minutes.`;
            return res.status(429).json({
                error: {
                    code: "AUTH_ACCOUNT_LOCKED",
                    message,
                    status: 429,
                    requestId: req.requestId,
                    retryAfter,
                    details: { lockedUntil: user.lockedUntil.toISOString() },
                },
                code: "AUTH_ACCOUNT_LOCKED",
                message,
                retryAfter,
                lockedUntil: user.lockedUntil.toISOString(),
            });
        }

        const { match } = await verifyPassword(password, user.password);
        if (!match) {
            user.failedLoginCount = (user.failedLoginCount || 0) + 1;
            if (user.failedLoginCount >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
                logger.warn("platform", "Platform account locked out", { email: user.email, attempts: user.failedLoginCount });
            }
            await user.save();
            const message = "Invalid credentials";
            return res.status(401).json({
                error: {
                    code: "AUTH_INVALID_CREDENTIALS",
                    message,
                    status: 401,
                    requestId: req.requestId,
                },
                message,
                code: "AUTH_INVALID_CREDENTIALS",
            });
        }

        const secret = getPlatformSecret();
        if (!secret) {
            return res.status(500).json({ message: "Platform JWT configuration missing (PLATFORM_JWT_SECRET)" });
        }

        user.failedLoginCount = 0;
        user.lockedUntil = null;
        user.lastLoginAt = new Date();
        await user.save();

        const tokens = generateTokens(user);

        return res.json({
            message: "Authentication successful",
            ...tokens,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: getPermissionsForRole(user.role),
            },
        });
    } catch (err) {
        logger.error("platform", "Login error", { error: err.message });
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Rotate Refresh Token
 * POST /api/platform/auth/refresh
 */
async function refreshToken(req, res) {
    try {
        const { refreshToken: rawRefresh } = req.body;
        if (!rawRefresh) {
            return res.status(400).json({ message: "Refresh token is required" });
        }

        const secret = getPlatformSecret();
        const decoded = jwt.verify(rawRefresh, secret, {
            audience: REFRESH_AUDIENCE,
            issuer: PLATFORM_ISSUER,
        });

        const user = await PlatformUser.findById(decoded.id);
        if (!user || user.status !== "active") {
            return res.status(401).json({ message: "User not found or disabled" });
        }

        if (decoded.version != null && user.tokenVersion != null && decoded.version < user.tokenVersion) {
            return res.status(401).json({ message: "Session revoked. Please sign in again." });
        }

        const tokens = generateTokens(user);
        res.json(tokens);
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
}

/**
 * Get Current Platform User Profile & Permissions
 * GET /api/platform/auth/me
 */
async function getMe(req, res) {
    try {
        const user = await PlatformUser.findById(req.platformUser.id).select("-password");
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                lastLoginAt: user.lastLoginAt,
                permissions: getPermissionsForRole(user.role),
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    login,
    refreshToken,
    getMe,
};
