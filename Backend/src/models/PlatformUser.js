const mongoose = require("mongoose");

const platformUserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ["super_admin", "billing", "support", "analyst"],
            default: "support",
            index: true,
        },
        status: {
            type: String,
            enum: ["active", "disabled"],
            default: "active",
            index: true,
        },
        mfa: {
            enabled: {
                type: Boolean,
                default: false,
            },
            secretEncrypted: {
                type: String,
                default: null,
            },
            recoveryCodesHashed: [
                {
                    type: String,
                },
            ],
            enrolledAt: {
                type: Date,
                default: null,
            },
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
        failedLoginCount: {
            type: Number,
            default: 0,
        },
        lockedUntil: {
            type: Date,
            default: null,
        },
        tokenVersion: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Virtual isActive for compatibility with legacy PlatformAdmin code
platformUserSchema.virtual("isActive").get(function () {
    return this.status === "active";
});

module.exports = mongoose.models.PlatformUser || mongoose.model("PlatformUser", platformUserSchema);
