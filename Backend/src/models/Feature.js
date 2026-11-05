const mongoose = require("mongoose");

const featureSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        category: {
            type: String,
            enum: ["core", "members", "sales", "coaching", "finance", "communication", "analytics", "integrations"],
            default: "core",
            index: true,
        },
        isCore: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    { timestamps: true }
);

try {
    module.exports = mongoose.model("Feature");
} catch (_) {
    module.exports = mongoose.model("Feature", featureSchema);
}
