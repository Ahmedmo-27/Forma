const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const tenantMetricSnapshotSchema = new mongoose.Schema(
    {
        localDate: { type: String, required: true },
        grain: { type: String, enum: ["day", "today", "cohort"], default: "day" },
        timezone: { type: String, required: true },
        metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        segments: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        hours: { type: [Number], default: () => [] },
        weekday: { type: Number, default: null },
        samples: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        lists: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        pending: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        cohorts: { type: mongoose.Schema.Types.Mixed, default: null },
        quality: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        jobStatus: { type: String, enum: ["ok", "warning", "error"], default: "ok" },
        computedAt: { type: Date, required: true },
    },
    { timestamps: true }
);

tenantMetricSnapshotSchema.plugin(tenantPlugin);
tenantMetricSnapshotSchema.index({ tenantId: 1, grain: 1, localDate: 1 }, { unique: true });

module.exports = mongoose.models.TenantMetricSnapshot
    || mongoose.model("TenantMetricSnapshot", tenantMetricSnapshotSchema);
