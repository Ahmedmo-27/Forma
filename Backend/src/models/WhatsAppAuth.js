const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

/**
 * Encrypted Baileys auth material for one staff member.
 * `creds` is the session credential blob. `key` rows are Signal key store entries.
 * Payloads are AES-256-GCM strings, never plaintext.
 */
const whatsAppAuthSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        kind: {
            type: String,
            enum: ["creds", "key"],
            required: true,
        },
        keyType: {
            type: String,
            default: "",
        },
        keyId: {
            type: String,
            default: "",
        },
        payload: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

whatsAppAuthSchema.plugin(tenantPlugin);
whatsAppAuthSchema.index(
    { tenantId: 1, userId: 1, kind: 1, keyType: 1, keyId: 1 },
    { unique: true }
);

try {
    module.exports = mongoose.model("WhatsAppAuth");
} catch (_) {
    module.exports = mongoose.model("WhatsAppAuth", whatsAppAuthSchema);
}
