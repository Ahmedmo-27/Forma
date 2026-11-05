const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const salesRepRequestSchema = new mongoose.Schema({
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending"
    }
}, { timestamps: true });

salesRepRequestSchema.plugin(tenantPlugin);
salesRepRequestSchema.index({ tenantId: 1, member: 1, status: 1 });

try {
    module.exports = mongoose.model("SalesRepRequest");
} catch (_) {
    module.exports = mongoose.model("SalesRepRequest", salesRepRequestSchema);
}
