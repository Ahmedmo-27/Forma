const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const objectiveSchema = new mongoose.Schema(
    {
        templateKey: { type: String, default: null },
        metricKey: { type: String, required: true },
        name: { type: String, required: true },
        direction: { type: String, enum: ["up", "down"], required: true },
        kind: { type: String, enum: ["rate", "duration", "count", "money"], required: true },
        baseline: { type: Number, required: true },
        baselineWindowDays: { type: Number, default: 30 },
        target: { type: Number, required: true },
        band: { type: String, enum: ["achievable", "stretch", "custom"], default: "custom" },
        why: { type: String, default: "" },
        startDate: { type: String, required: true },
        deadline: { type: String, required: true },
        ownerRole: { type: String, required: true },
        ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        cadence: { type: String, enum: ["weekly", "monthly"], default: "weekly" },
        status: {
            type: String,
            enum: ["on_track", "at_risk", "off_track", "achieved", "missed", "archived"],
            default: "on_track",
        },
        targetSource: { type: String, default: null },
        archived: { type: Boolean, default: false },
        behindStreak: { type: Number, default: 0 },
    },
    { timestamps: true }
);

objectiveSchema.plugin(tenantPlugin);
objectiveSchema.index({ tenantId: 1, archived: 1, status: 1 });
objectiveSchema.index({ tenantId: 1, metricKey: 1, deadline: 1 });

module.exports = mongoose.models.Objective || mongoose.model("Objective", objectiveSchema);
