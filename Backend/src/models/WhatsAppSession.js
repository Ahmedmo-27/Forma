const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const STATUSES = ["disconnected", "qr", "connecting", "connected"];

const whatsAppSessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: STATUSES,
            default: "disconnected",
        },
        phone: {
            type: String,
            default: null,
        },
        lastConnectedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

whatsAppSessionSchema.plugin(tenantPlugin);
whatsAppSessionSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
whatsAppSessionSchema.index({ status: 1 });

try {
    module.exports = mongoose.model("WhatsAppSession");
} catch (_) {
    module.exports = mongoose.model("WhatsAppSession", whatsAppSessionSchema);
}

module.exports.WHATSAPP_SESSION_STATUSES = STATUSES;
