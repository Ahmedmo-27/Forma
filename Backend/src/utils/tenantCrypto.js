const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

function getSecretKey() {
    const raw = process.env.TENANT_SECRET_KEY;
    if (!raw) {
        if (process.env.NODE_ENV === "test") {
            return crypto
                .createHash("sha256")
                .update("test_tenant_secret_key_32chars!!")
                .digest();
        }
        throw new Error("TENANT_SECRET_KEY is required for tenant secret encryption");
    }
    return crypto.createHash("sha256").update(String(raw)).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex-encoded).
 */
function encryptSecret(plaintext) {
    if (!plaintext || typeof plaintext !== "string") {
        return plaintext;
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string (iv:authTag:ciphertext).
 * If the input is not in the expected format, returns null.
 */
function decryptSecret(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== "string") {
        return null;
    }
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) {
        return null;
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    try {
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch {
        return null;
    }
}

module.exports = {
    encryptSecret,
    decryptSecret,
};
