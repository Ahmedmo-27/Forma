const bcrypt = require("bcryptjs");
const logger = require("./logger");

/** OWASP-aligned cost for interactive staff logins (was 10). */
const BCRYPT_ROUNDS = 12;

const MIN_PASSWORD_LENGTH = 8;

function bumpTokenVersion(user) {
    user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
    return user.tokenVersion;
}

function inspectStoredPassword(stored) {
    if (!stored || typeof stored !== "string") {
        return {
            valid: false,
            reason: "missing_or_not_string",
            length: stored ? String(stored).length : 0,
        };
    }

    const match = stored.match(/^\$2[aby]?\$(\d+)\$/);
    if (!match) {
        return {
            valid: false,
            reason: "not_bcrypt_format",
            length: stored.length,
        };
    }

    return {
        valid: true,
        rounds: Number(match[1]),
        matchesAppRounds: Number(match[1]) === BCRYPT_ROUNDS,
    };
}

async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(plainPassword, storedPassword, context = {}) {
    const inspection = inspectStoredPassword(storedPassword);

    if (!inspection.valid) {
        logger.warn("auth", "Stored password is not a bcrypt hash", {
            requestId: context.requestId,
            userId: context.userId,
            reason: inspection.reason,
        }, { auth: true });
        return { match: false, inspection, compareSkipped: true, needsRehash: false };
    }

    const match = await bcrypt.compare(plainPassword, storedPassword);
    const needsRehash = match && !inspection.matchesAppRounds;

    // Do not log hash prefixes, rounds detail, or password length — reduces credential-adjacent leakage
    logger.auth("info", "Password compare completed", {
        requestId: context.requestId,
        userId: context.userId,
        match,
        needsRehash,
    });

    return { match, inspection, needsRehash };
}

function normalizeEmail(email) {
    if (!email || typeof email !== "string") return "";
    return email.trim().toLowerCase();
}

module.exports = {
    BCRYPT_ROUNDS,
    MIN_PASSWORD_LENGTH,
    bumpTokenVersion,
    hashPassword,
    verifyPassword,
    inspectStoredPassword,
    normalizeEmail,
};
