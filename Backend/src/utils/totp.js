const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { encryptSecret, decryptSecret } = require("./tenantCrypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Base32 Encode a Buffer
 */
function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;

        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
}

/**
 * Base32 Decode to Buffer
 */
function base32Decode(input) {
    const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < cleaned.length; i++) {
        const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
        if (idx === -1) {
            throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
        }

        value = (value << 5) | idx;
        bits += 5;

        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(output);
}

/**
 * Generate a new random 20-byte Base32 secret for TOTP (160-bit secret).
 */
function generateTotpSecret() {
    const randomBytes = crypto.randomBytes(20);
    return base32Encode(randomBytes);
}

/**
 * Generate standard RFC 6238 TOTP code for a secret and time step.
 * Default step is 30 seconds, 6 digits, HMAC-SHA1.
 */
function generateTotpCode(secretBase32, timeMs = Date.now(), stepSeconds = 30) {
    const key = base32Decode(secretBase32);
    const counter = Math.floor(timeMs / 1000 / stepSeconds);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;

    const codeInt =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    const token = (codeInt % 1000000).toString().padStart(6, "0");
    return token;
}

/**
 * Verify a TOTP code against a secret with ±window steps allowance.
 */
function verifyTotpCode(secretBase32, token, window = 1, timeMs = Date.now(), stepSeconds = 30) {
    if (!token || typeof token !== "string" || token.length !== 6) {
        return false;
    }

    for (let offset = -window; offset <= window; offset++) {
        const checkTime = timeMs + offset * stepSeconds * 1000;
        const expected = generateTotpCode(secretBase32, checkTime, stepSeconds);
        if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
            return true;
        }
    }

    return false;
}

/**
 * Generate random 8-character recovery codes (e.g., "ABCD-1234").
 * Returns { plainCodes, hashedCodes }.
 */
async function generateRecoveryCodes(count = 8) {
    const plainCodes = [];
    const hashedCodes = [];

    for (let i = 0; i < count; i++) {
        const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
        const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
        plainCodes.push(code);

        const hashed = await bcrypt.hash(code, 10);
        hashedCodes.push(hashed);
    }

    return { plainCodes, hashedCodes };
}

/**
 * Verify a recovery code against stored bcrypt hashes.
 * Returns the matching hash index if valid, or -1 if invalid.
 */
async function verifyRecoveryCode(recoveryCode, hashedCodes = []) {
    if (!recoveryCode || !hashedCodes.length) return -1;
    const clean = recoveryCode.trim().toUpperCase();

    for (let i = 0; i < hashedCodes.length; i++) {
        const match = await bcrypt.compare(clean, hashedCodes[i]);
        if (match) return i;
    }

    return -1;
}

/**
 * Generate standard otpauth URL for QR codes.
 */
function getOtpAuthUrl({ issuer = "Forma", accountName, secret }) {
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
    generateTotpSecret,
    generateTotpCode,
    verifyTotpCode,
    generateRecoveryCodes,
    verifyRecoveryCode,
    getOtpAuthUrl,
    encryptSecret,
    decryptSecret,
};
