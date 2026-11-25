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
        enum: [
            "member_assigned",
            "task_assigned",
            "package_exception_pending",
            "package_exception_resolved",
            "sales_rep_request_pending",
            "coach_rep_request_pending",
            "maintenance_due",
            "staff_identity_resolved",
        ],
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
        required: false,
        default: null,
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
    // Optional idempotency key. A second notification with the same
    // (tenantId, recipient, dedupeKey) is rejected by the unique index below,
    // which keeps scheduled reminders from repeating across runs and instances.
    dedupeKey: {
        type: String,
        default: undefined,
    },
}, { timestamps: true });

notificationSchema.plugin(tenantPlugin);
notificationSchema.index({ tenantId: 1, recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index(
    { tenantId: 1, recipient: 1, dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
