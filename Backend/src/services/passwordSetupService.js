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
    if (!userId || !tenantId || !email || !purpose) {
        throw new Error("issueToken requires userId, tenantId, email, and purpose");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const ttlHours = hours || (purpose === "reset" ? RESET_HOURS : INVITE_HOURS);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // PasswordSetupToken intentionally has no tenantPlugin (public redeem before ALS exists).
    // Always stamp tenantId explicitly and scope invalidation by userId.
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

/**
 * Mark one unused, unexpired token as used. A second caller loses the race.
 */
async function consumeToken(token) {
    if (!token || typeof token !== "string") return null;
    return PasswordSetupToken.findOneAndUpdate(
        { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true }
    );
}

async function releaseToken(record) {
    if (!record?._id) return;
    await PasswordSetupToken.updateOne({ _id: record._id }, { $set: { usedAt: null } });
}

async function revokeUnusedTokens(userId) {
    if (!userId) return;
    await PasswordSetupToken.updateMany(
        { userId, usedAt: null },
        { $set: { usedAt: new Date() } }
    );
}

module.exports = {
    INVITE_HOURS,
    RESET_HOURS,
    hashToken,
    relativeUrl,
    absoluteUrl,
    issueToken,
    consumeToken,
    releaseToken,
    revokeUnusedTokens,
};
