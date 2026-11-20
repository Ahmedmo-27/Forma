const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const CATEGORY_SECTIONS = ["retail", "bar"];

/** Gym-wide product grouping (shared by every branch). */
const productCategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        section: { type: String, enum: CATEGORY_SECTIONS, required: true },
        sortOrder: { type: Number, default: 0 },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

productCategorySchema.plugin(tenantPlugin);

productCategorySchema.index({ tenantId: 1, section: 1, sortOrder: 1 });
productCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports =
    mongoose.models.ProductCategory ||
    mongoose.model("ProductCategory", productCategorySchema);
module.exports.CATEGORY_SECTIONS = CATEGORY_SECTIONS;
