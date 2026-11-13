const mongoose = require("mongoose");

/**
 * One-time password setup / reset tokens.
 * Intentionally WITHOUT tenantPlugin: public redeem must look the token up by hash
 * before a tenant AsyncLocalStorage context exists. Always set tenantId via
 * passwordSetupService.issueToken (required). Only the SHA-256 hash is stored.
 */
const passwordSetupTokenSchema = new mongoose.Schema(
    {
        tokenHash: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        purpose: { type: String, enum: ["invite", "reset"], required: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.models.PasswordSetupToken
    || mongoose.model("PasswordSetupToken", passwordSetupTokenSchema);
