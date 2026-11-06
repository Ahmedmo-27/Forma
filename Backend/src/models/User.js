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
    },

    // Difference from the role's default features. Empty means "use role defaults"
    // plus any legacy ability flags that were turned off.
    featureAccess: {
        grants: { type: [String], default: [] },
        revokes: { type: [String], default: [] },
    },
}, { timestamps: true });

userSchema.plugin(tenantPlugin);
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
