const mongoose = require("mongoose");

/**
 * Audit rows that could not be written after retries. Platform-level (no tenant
 * plugin) so a missing tenant context can never block the fallback write.
 */
const auditDeadLetterSchema = new mongoose.Schema(
    {
        payload: { type: mongoose.Schema.Types.Mixed, required: true },
        error: { type: String, default: "" },
        attempts: { type: Number, default: 0 },
        replayedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

auditDeadLetterSchema.index({ replayedAt: 1, createdAt: -1 });

module.exports =
    mongoose.models.AuditDeadLetter || mongoose.model("AuditDeadLetter", auditDeadLetterSchema);
