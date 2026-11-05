const mongoose = require("mongoose");

const platformSettingSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null,
        },
    },
    { timestamps: true }
);

try {
    module.exports = mongoose.model("PlatformSetting");
} catch (_) {
    module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
}
