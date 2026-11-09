const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const taskMemberSchema = new mongoose.Schema({
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true,
    },
    name: {
        type: String,
        default: "",
    },
    systemId: {
        type: mongoose.Schema.Types.Mixed,
        default: "",
    },
    phone: {
        type: String,
        default: "",
    },
    status: {
        type: String,
        enum: ["pending", "completed"],
        default: "pending",
    },
    completedAt: {
        type: Date,
        default: null,
    },
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    notes: {
        type: String,
        default: "",
    },
}, { _id: true });

const taskSchema = new mongoose.Schema({
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    targetRole: {
        type: String,
        enum: ["Sales", "Sales Manager", "Coach", "Coach Manager"],
        required: true,
    },
    transferType: {
        type: String,
        enum: ["bulk", "quick"],
        default: "bulk",
    },
    title: {
        type: String,
        default: "Tasks",
    },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed"],
        default: "pending",
    },
    members: [taskMemberSchema],
    totalCount: {
        type: Number,
        default: 0,
    },
    completedCount: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

taskSchema.plugin(tenantPlugin);
taskSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 });
taskSchema.index({ tenantId: 1, assignedTo: 1, createdAt: -1 });
taskSchema.index({ tenantId: 1, "members.member": 1 });

module.exports = mongoose.models.Task || mongoose.model("Task", taskSchema);
