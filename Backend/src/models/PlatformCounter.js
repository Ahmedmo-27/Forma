const mongoose = require("mongoose");

const platformCounterSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        seq: {
            type: Number,
            required: true,
            default: 0,
        },
    },
    { timestamps: true }
);

try {
    module.exports = mongoose.model("PlatformCounter");
} catch (_) {
    module.exports = mongoose.model("PlatformCounter", platformCounterSchema);
}
