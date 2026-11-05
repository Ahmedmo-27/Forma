const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const userSchema = new mongoose.Schema({
    name: String,

    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },

    username: String,
    mobile_number: String,
    password: String,

    canViewPhones: {
        type: Boolean,
        default: true,
    },

    role: {
        type: String,
        enum: ["Owner", "Receptionist", "Coach", "Coach Manager", "Accountant", "Sales", "Sales Manager"],
        default: "Receptionist"
    },

    monthlyTarget: {
        type: Number,
        default: 0
    },

    abilities: {
        canCommentOnMembers: { type: Boolean, default: true },
        canRequestAssignment: { type: Boolean, default: true },
        canRequestTakeover: { type: Boolean, default: true },
        canSendWhatsAppTemplates: { type: Boolean, default: true },
    }
}, { timestamps: true });

userSchema.plugin(tenantPlugin);
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);
