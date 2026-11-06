const crypto = require("crypto");
const PasswordSetupToken = require("../models/PasswordSetupToken");

const INVITE_HOURS = 72;
const RESET_HOURS = 2;

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function frontendOrigin() {
    return (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
        .split(",")[0]
        .trim()
        .replace(/\/+$/, "");
}

function relativeUrl(token, email) {
    return `/auth/setup-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function absoluteUrl(token, email) {
    return `${frontendOrigin()}${relativeUrl(token, email)}`;
}

/**
 * Invalidate unused tokens of the same purpose and store a new hash.
 * Returns the raw token (only available at issue time).
 */
async function issueToken({ userId, tenantId, email, purpose, hours }) {
    const token = crypto.randomBytes(32).toString("hex");
    const ttlHours = hours || (purpose === "reset" ? RESET_HOURS : INVITE_HOURS);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await PasswordSetupToken.updateMany(
        { userId, purpose, usedAt: null },
        { $set: { usedAt: new Date() } }
    );

    await PasswordSetupToken.create({
        tokenHash: hashToken(token),
        userId,
        tenantId,
        email,
        purpose,
        expiresAt,
    });

    return { token, expiresAt, expiresInHours: ttlHours };
}

async function findActiveToken(token) {
    if (!token || typeof token !== "string") return null;
    const record = await PasswordSetupToken.findOne({ tokenHash: hashToken(token) });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) return null;
    return record;
}

module.exports = {
    INVITE_HOURS,
    RESET_HOURS,
    hashToken,
    relativeUrl,
    absoluteUrl,
    issueToken,
    findActiveToken,
};
