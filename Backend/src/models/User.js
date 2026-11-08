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

    username: {
        type: String,
        trim: true,
        lowercase: true,
    },
    mobile_number: String,
    password: String,

    canViewPhones: {
        type: Boolean,
        default: true,
    },

    role: {
        type: String,
        enum: ["Owner", "General Manager", "Receptionist", "Coach", "Coach Manager", "Accountant", "Sales", "Sales Manager"],
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

    // Extra areas added to, or taken off, the role checklist for this person.
    accessOverrides: {
        add: { type: [String], default: [] },
        remove: { type: [String], default: [] },
    },
}, { timestamps: true });

userSchema.plugin(tenantPlugin);
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index(
    { tenantId: 1, username: 1 },
    { unique: true, partialFilterExpression: { username: { $type: "string" } } }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
