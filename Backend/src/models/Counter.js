const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const counterSchema = new mongoose.Schema(
    {
        // tenantId injected by tenantPlugin; also declared for clarity / indexes
        name: {
            type: String,
            required: true,
            trim: true,
        },
        seq: {
            type: Number,
            required: true,
            default: 0,
        },
    },
    { timestamps: true }
);

counterSchema.plugin(tenantPlugin);

// Compound unique index ensuring per-tenant isolated sequence numbering
counterSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
