const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const insightSchema = new mongoose.Schema(
    {
        ruleKey: { type: String, required: true },
        weekKey: { type: String, required: true },
        role: { type: String, required: true },
        title: { type: String, required: true },
        action: { type: String, required: true },
        href: { type: String, default: null },
        impact: { type: Number, default: 0 },
        evidence: { type: mongoose.Schema.Types.Mixed, default: null },
        status: { type: String, enum: ["new", "seen", "dismissed", "actioned"], default: "new" },
        dismissReason: { type: String, default: null },
        objectiveId: { type: mongoose.Schema.Types.ObjectId, ref: "Objective", default: null },
    },
    { timestamps: true }
);

insightSchema.plugin(tenantPlugin);
insightSchema.index({ tenantId: 1, ruleKey: 1, weekKey: 1 }, { unique: true });
insightSchema.index({ tenantId: 1, status: 1, impact: -1 });

module.exports = mongoose.models.Insight || mongoose.model("Insight", insightSchema);
