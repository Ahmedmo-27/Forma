const mongoose = require("mongoose");

/**
 * Last run of each scheduled job, shown in /platform/health. Platform-level.
 * _id is the job name.
 */
const scheduledJobRunSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true },
        status: { type: String, enum: ["running", "success", "failed"], default: "running" },
        instance: { type: String, default: "" },
        intervalMs: { type: Number, default: null },
        lastStartedAt: { type: Date, default: null },
        lastFinishedAt: { type: Date, default: null },
        lastSuccessAt: { type: Date, default: null },
        lastFailureAt: { type: Date, default: null },
        lastDurationMs: { type: Number, default: null },
        lastError: { type: String, default: null },
        lastResult: { type: mongoose.Schema.Types.Mixed, default: null },
        runCount: { type: Number, default: 0 },
        failureCount: { type: Number, default: 0 },
    },
    { timestamps: false }
);

module.exports =
    mongoose.models.ScheduledJobRun || mongoose.model("ScheduledJobRun", scheduledJobRunSchema);
