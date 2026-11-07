const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const objectiveProgressSchema = new mongoose.Schema(
    {
        objectiveId: { type: mongoose.Schema.Types.ObjectId, ref: "Objective", required: true },
        localDate: { type: String, required: true },
        actual: { type: Number, required: true },
        expected: { type: Number, required: true },
        pace: { type: Number, default: null },
        elapsed: { type: Number, default: 0 },
        status: { type: String, required: true },
        projected: { type: String, default: null },
    },
    { timestamps: true }
);

objectiveProgressSchema.plugin(tenantPlugin);
objectiveProgressSchema.index({ tenantId: 1, objectiveId: 1, localDate: 1 }, { unique: true });

module.exports = mongoose.models.ObjectiveProgress
    || mongoose.model("ObjectiveProgress", objectiveProgressSchema);
