const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const packageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    activityType: {
        type: String,
        default: "gym"
    },

    duration: {
        type: String,
        enum: ["1 month", "3 months", "6 months", "1 year"],
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    // Max days a member on this package is allowed to freeze per subscription
    freezeLimitDays: {
        type: Number,
        default: 0
    },

    // How many invitation slots a member on this package gets
    invitationLimit: {
        type: Number,
        default: 0
    },

    // Discount % auto-applied on renewal (e.g. 15 for 15%)
    renewalDiscountPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },

    description: {
        type: String,
        default: null
    },

    isActive: {
        type: Boolean,
        default: true
    },

    // Member-specific package created when a sales manager proposes custom terms
    hasException: {
        type: Boolean,
        default: false
    },

    // Catalog package this exception was based on
    basedOn: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Package",
        default: null
    },

    // Member this exception package applies to (set on approval)
    forMember: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member",
        default: null
    },

    createdBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref:"User",
        required: true
    },

    free_pt_sessions: {
        type: Number,
        default: 0
    }

},
    { timestamps: true }
);

packageSchema.plugin(tenantPlugin);
packageSchema.index({ tenantId: 1, name: 1, hasException: 1 });
packageSchema.index({ tenantId: 1, isActive: 1 });

try {
    module.exports = mongoose.model("Package");
} catch (_) {
    module.exports = mongoose.model("Package", packageSchema);
}
