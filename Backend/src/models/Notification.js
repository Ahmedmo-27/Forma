const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    type: {
        type: String,
        enum: ["member_assigned", "package_exception_pending", "package_exception_resolved", "sales_rep_request_pending"],
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true,
    },
    read: {
        type: Boolean,
        default: false,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
}, { timestamps: true });

notificationSchema.plugin(tenantPlugin);
notificationSchema.index({ tenantId: 1, recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
