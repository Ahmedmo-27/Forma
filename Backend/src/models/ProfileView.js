const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const profileViewSchema = new mongoose.Schema({
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        required: true
    },
    viewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

profileViewSchema.plugin(tenantPlugin);
profileViewSchema.index({ tenantId: 1, member: 1, createdAt: -1 });

module.exports = mongoose.model("ProfileView", profileViewSchema);
