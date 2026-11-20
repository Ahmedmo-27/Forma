const mongoose = require("mongoose");

/**
 * Cross-instance lock for scheduled jobs. Platform-level (not tenant scoped).
 * _id is the job name; expiresAt is when another instance may run it again.
 */
const schedulerLockSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true },
        owner: { type: String, default: "" },
        lockedAt: { type: Date, default: null },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: false }
);

// Housekeeping: drop lock rows a day after they expire.
schedulerLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports =
    mongoose.models.SchedulerLock || mongoose.model("SchedulerLock", schedulerLockSchema);
