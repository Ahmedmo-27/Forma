const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const importErrorSchema = new mongoose.Schema({
    line: { type: Number, default: null },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    reason: { type: String, required: true },
}, { _id: false });

const memberImportJobSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ["processing", "completed", "failed"],
        default: "processing",
    },
    stage: { type: String, default: "Upload received" },
    fileName: { type: String, default: "" },
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    chunkSize: { type: Number, default: 0 },
    chunkIndex: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    createdCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    rowErrors: { type: [importErrorSchema], default: [] },
    errorMessage: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

memberImportJobSchema.plugin(tenantPlugin);

module.exports = mongoose.model("MemberImportJob", memberImportJobSchema);
