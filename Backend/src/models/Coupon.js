const mongoose = require("mongoose");
const { enforceEgpCurrency } = require("./forceEgp");

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: ["percentage", "fixed"],
        },
        discountValue: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "EGP",
            uppercase: true,
        },
        appliesTo: {
            planKeys: [{ type: String }], // empty means all plans
            cycles: [{ type: String, enum: ["monthly", "yearly"] }], // empty means all cycles
        },
        maxRedemptions: {
            type: Number,
            default: null, // Nullable: unlimited redemptions
        },
        redeemedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    { timestamps: true }
);

/**
 * Atomically attempt to redeem a coupon.
 * Prevents race conditions and strictly respects maxRedemptions.
 */
couponSchema.statics.redeemAtomic = async function (code, planKey = null, cycle = null, now = new Date()) {
    const cleanCode = String(code).trim().toUpperCase();

    const query = {
        code: cleanCode,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        $expr: {
            $or: [
                { $eq: ["$maxRedemptions", null] },
                { $lt: ["$redeemedCount", "$maxRedemptions"] },
            ],
        },
    };

    if (planKey) {
        query.$or.push({ "appliesTo.planKeys": { $size: 0 } }, { "appliesTo.planKeys": planKey });
    }

    if (cycle) {
        query.$or.push({ "appliesTo.cycles": { $size: 0 } }, { "appliesTo.cycles": cycle });
    }

    const updated = await this.findOneAndUpdate(
        query,
        { $inc: { redeemedCount: 1 } },
        { new: true }
    );

    return updated;
};

enforceEgpCurrency(couponSchema);

try {
    module.exports = mongoose.model("Coupon");
} catch (_) {
    module.exports = mongoose.model("Coupon", couponSchema);
}
