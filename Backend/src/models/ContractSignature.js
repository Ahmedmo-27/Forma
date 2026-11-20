const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

/**
 * A member's signature on one membership (subscription). Append-only: a signed
 * contract is never edited; the terms text is frozen at signing time.
 */
const contractSignatureSchema = new mongoose.Schema(
    {
        member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
        subscription: { type: mongoose.Schema.Types.ObjectId, required: true },
        subscriptionId: { type: Number, default: null },
        signerName: { type: String, required: true, trim: true, maxlength: 120 },
        image: { type: Buffer, required: true },
        imageType: { type: String, enum: ["image/png"], default: "image/png" },
        terms: { type: String, default: "", maxlength: 20000 },
        termsHash: { type: String, required: true },
        contractSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        signedAt: { type: Date, default: Date.now },
        capturedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        ip: { type: String, default: null },
        userAgent: { type: String, default: null, maxlength: 400 },
    },
    { timestamps: true }
);

contractSignatureSchema.plugin(tenantPlugin);

contractSignatureSchema.index({ tenantId: 1, subscription: 1 }, { unique: true });
contractSignatureSchema.index({ tenantId: 1, member: 1, signedAt: -1 });

module.exports =
    mongoose.models.ContractSignature || mongoose.model("ContractSignature", contractSignatureSchema);
