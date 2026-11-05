const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
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

// Compound unique index ensuring per-tenant isolated sequence numbering
counterSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Counter", counterSchema);
