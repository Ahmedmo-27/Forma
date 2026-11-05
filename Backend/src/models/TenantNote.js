const mongoose = require("mongoose");

const tenantNoteSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            required: true,
        },
        authorName: {
            type: String,
            required: true,
        },
        authorEmail: {
            type: String,
            required: true,
        },
        text: {
            type: String,
            required: true,
            trim: true,
        },
        pinned: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

tenantNoteSchema.index({ tenantId: 1, pinned: -1, createdAt: -1 });

module.exports = mongoose.models.TenantNote || mongoose.model("TenantNote", tenantNoteSchema);
