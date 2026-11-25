const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const STAFF_ROLE_ENUM = [
    "Owner",
    "General Manager",
    "Receptionist",
    "Coach",
    "Head Coach",
    "Accountant",
    "Sales",
    "Sales Manager",
    "Retail",
];

const staffMembershipSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
        },
        role: {
            type: String,
            enum: STAFF_ROLE_ENUM,
            required: true,
        },
        allowedLocationIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
        }],
        canAccessAllLocations: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["active", "disabled"],
            default: "active",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

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
    // Canonical phone used for global uniqueness. Display stays on mobile_number.
    phoneKey: {
        type: String,
        trim: true,
    },
    password: String,
    // Bumped when the password changes so older login tokens stop working.
    tokenVersion: {
        type: Number,
        default: 0,
    },

    canViewPhones: {
        type: Boolean,
        default: true,
    },

    role: {
        type: String,
        enum: STAFF_ROLE_ENUM,
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

    // Branches this staff member may view. Owner always bypasses (treated as all).
    allowedLocationIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Location",
    }],
    canAccessAllLocations: {
        type: Boolean,
        default: false,
    },

    // Per-gym roles for staff who work at more than one tenant (shared login).
    // Empty means legacy single-tenant: use top-level tenantId + role.
    memberships: {
        type: [staffMembershipSchema],
        default: [],
    },

    // Platform announcements the user has dismissed ("Got it" / mark read).
    dismissedAnnouncementIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Announcement",
    }],

    // Staff account restriction: lock (manual unlock) or timed suspend.
    isBlocked: {
        type: Boolean,
        default: false,
    },
    restrictionType: {
        type: String,
        enum: ["lock", "suspend"],
        default: null,
    },
    suspendedUntil: {
        type: Date,
        default: null,
    },
    blockedReason: {
        type: String,
        default: null,
    },
    blockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    blockedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

userSchema.plugin(tenantPlugin);
// Unique across every gym, not per tenant.
userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
    { username: 1 },
    { unique: true, partialFilterExpression: { username: { $type: "string" } } }
);
userSchema.index(
    { phoneKey: 1 },
    { unique: true, partialFilterExpression: { phoneKey: { $gt: "" } } }
);
userSchema.index({ "memberships.tenantId": 1, "memberships.status": 1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
