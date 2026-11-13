const jwt = require("jsonwebtoken");
const PlatformUser = require("../models/PlatformUser");
const { hashPassword, verifyPassword, normalizeEmail } = require("../utils/passwordUtils");
const {
    generateTotpSecret,
    generateTotpCode,
    verifyTotpCode,
    generateRecoveryCodes,
    verifyRecoveryCode,
    getOtpAuthUrl,
    encryptSecret,
    decryptSecret,
} = require("../utils/totp");
const {
    PLATFORM_AUDIENCE,
    PLATFORM_ISSUER,
    getPlatformSecret,
} = require("../middleware/platformAuth");
const { getPermissionsForRole } = require("../config/platformPermissions");
const logger = require("../utils/logger");

const REFRESH_AUDIENCE = "leap-platform-refresh";
const TEMP_MFA_AUDIENCE = "leap-platform-temp-mfa";

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

        // Reset lockout upon correct password
        user.failedLoginCount = 0;
        user.lockedUntil = null;
        await user.save();

        const secret = getPlatformSecret();
        if (!secret) {
            return res.status(500).json({ message: "Platform JWT configuration missing (PLATFORM_JWT_SECRET)" });
        }

        // Always require MFA: setup for first login, challenge when already enrolled.
        const tempToken = jwt.sign(
            {
                id: user._id.toString(),
                email: user.email,
                purpose: "mfa",
            },
            secret,
            {
                audience: TEMP_MFA_AUDIENCE,
                issuer: PLATFORM_ISSUER,
                expiresIn: "10m",
            }
        );

        if (user.mfa?.enabled) {
            return res.json({
                message: "MFA challenge required",
                mfaRequired: true,
                tempToken,
            });
        }

        return res.json({
            message: "MFA setup required",
            mfaSetupRequired: true,
            tempToken,
        });
    } catch (err) {
        logger.error("platform", "Login error", { error: err.message });
        return res.status(500).json({ message: "Server error", error: err.message });
    }
}

/**
 * Initiate MFA Enrollment (Generate Secret & QR URI)
 * POST /api/platform/auth/mfa/setup
 */
async function setupMfa(req, res) {
    try {
        const { tempToken } = req.body;
        if (!tempToken) {
            return res.status(400).json({ message: "Temporary session token required" });
        }

        const secret = getPlatformSecret();
        const decoded = jwt.verify(tempToken, secret, {
            audience: TEMP_MFA_AUDIENCE,
            issuer: PLATFORM_ISSUER,
        });

        const user = await PlatformUser.findById(decoded.id);
        if (!user || user.status !== "active") {
            return res.status(401).json({ message: "User not found or disabled" });
        }

        const plainSecret = generateTotpSecret();
        const encryptedSecret = encryptSecret(plainSecret);

        user.mfa = user.mfa || {};
        user.mfa.secretEncrypted = encryptedSecret;
        user.mfa.enabled = false;
        await user.save();

        const otpAuthUrl = getOtpAuthUrl({
            issuer: "Forma",
            accountName: user.email,
            secret: plainSecret,
        });

        res.json({
            secret: plainSecret,
            otpAuthUrl,
        });
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired temporary token", error: err.message });
    }
}

/**
 * Complete MFA Enrollment & Generate Recovery Codes
 * POST /api/platform/auth/mfa/verify-enrollment
 */
async function verifyEnrollment(req, res) {
    try {
        const { tempToken, code } = req.body;
        if (!tempToken || !code) {
            return res.status(400).json({ message: "Token and verification code required" });
        }

        const secret = getPlatformSecret();
        const decoded = jwt.verify(tempToken, secret, {
            audience: TEMP_MFA_AUDIENCE,
            issuer: PLATFORM_ISSUER,
        });

        const user = await PlatformUser.findById(decoded.id);
        if (!user || !user.mfa?.secretEncrypted) {
            return res.status(400).json({ message: "MFA setup has not been initiated" });
        }

        const plainSecret = decryptSecret(user.mfa.secretEncrypted);
        const isValid = verifyTotpCode(plainSecret, String(code).trim());
        if (!isValid) {
            return res.status(400).json({ message: "Invalid 6-digit verification code" });
        }

        const { plainCodes, hashedCodes } = await generateRecoveryCodes(8);
        user.mfa.enabled = true;
        user.mfa.recoveryCodesHashed = hashedCodes;
        user.mfa.enrolledAt = new Date();
        user.lastLoginAt = new Date();
        await user.save();

        const tokens = generateTokens(user);

        res.json({
            message: "MFA successfully enrolled and verified",
            recoveryCodes: plainCodes,
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
        return res.status(401).json({ message: "Invalid or expired token", error: err.message });
    }
}

/**
 * Complete MFA Challenge via TOTP code or Backup Recovery Code
 * POST /api/platform/auth/mfa/challenge
 */
async function challengeMfa(req, res) {
    try {
        const { tempToken, code, isRecoveryCode } = req.body;
        if (!tempToken || !code) {
            return res.status(400).json({ message: "Temporary token and code are required" });
        }

        const secret = getPlatformSecret();
        const decoded = jwt.verify(tempToken, secret, {
            audience: TEMP_MFA_AUDIENCE,
            issuer: PLATFORM_ISSUER,
        });

        const user = await PlatformUser.findById(decoded.id);
        if (!user || user.status !== "active") {
            return res.status(401).json({ message: "User not found or disabled" });
        }

        if (isRecoveryCode) {
            const index = await verifyRecoveryCode(String(code).trim(), user.mfa?.recoveryCodesHashed || []);
            if (index === -1) {
                return res.status(400).json({ message: "Invalid recovery code" });
            }
            // Consume single-use recovery code
            user.mfa.recoveryCodesHashed.splice(index, 1);
            user.markModified("mfa.recoveryCodesHashed");
        } else {
            if (!user.mfa?.secretEncrypted) {
                return res.status(400).json({ message: "MFA not configured for user" });
            }
            const plainSecret = decryptSecret(user.mfa.secretEncrypted);
            const isValid = verifyTotpCode(plainSecret, String(code).trim());
            if (!isValid) {
                return res.status(400).json({ message: "Invalid 6-digit authentication code" });
            }
        }

        user.lastLoginAt = new Date();
        await user.save();

        const tokens = generateTokens(user);

        res.json({
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
        return res.status(401).json({ message: "Invalid or expired authentication session", error: err.message });
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
        const user = await PlatformUser.findById(req.platformUser.id).select("-password -mfa.secretEncrypted -mfa.recoveryCodesHashed");
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                mfaEnabled: user.mfa?.enabled || false,
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
    setupMfa,
    verifyEnrollment,
    challengeMfa,
    refreshToken,
    getMe,
};
