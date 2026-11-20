const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const ProductCategory = require("../models/ProductCategory");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const Sale = require("../models/Sale");
const { writeAudit } = require("../utils/audit");
const {
    httpError,
    fail,
    assertId,
    assertLocationAccess,
    resolveLocationId,
    locationFilterFor,
    ensureDefaultCategories,
    ensureInHouseVendor,
} = require("../services/retailService");

const oid = (id) => new mongoose.Types.ObjectId(String(id));

// ── Serializers ──────────────────────────────────────────────────────────────

function serializeVendor(v) {
    return {
        _id: String(v._id),
        locationId: String(v.locationId),
        name: v.name,
        type: v.type,
        contactName: v.contactName || "",
        phone: v.phone || "",
        email: v.email || "",
        notes: v.notes || "",
        commissionPercent: v.commissionPercent,
        active: v.active !== false,
        createdAt: v.createdAt,
    };
}

function serializeCategory(c) {
    return {
        _id: String(c._id),
        name: c.name,
        section: c.section,
        sortOrder: c.sortOrder || 0,
        active: c.active !== false,
    };
}

function serializeProduct(p) {
    return {
        _id: String(p._id),
        locationId: String(p.locationId),
        name: p.name,
        categoryId: String(p.categoryId),
        vendorId: String(p.vendorId),
        price: p.price,
        sku: p.sku || "",
        trackStock: p.trackStock === true,
        stockQty: p.stockQty || 0,
        lowStockThreshold: p.lowStockThreshold || 0,
        lowStock: p.trackStock === true && (p.stockQty || 0) <= (p.lowStockThreshold || 0),
        outOfStock: p.trackStock === true && (p.stockQty || 0) <= 0,
        imageUrl: p.imageUrl || "",
        active: p.active !== false,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
    };
}

function serializeMovement(m) {
    return {
        _id: String(m._id),
        productId: String(m.productId),
        type: m.type,
        qty: m.qty,
        balanceAfter: m.balanceAfter,
        reason: m.reason || "",
        saleId: m.saleId ? String(m.saleId) : null,
        createdBy: m.createdBy
            ? { _id: String(m.createdBy._id || m.createdBy), name: m.createdBy.name || m.createdBy.username || "" }
            : null,
        createdAt: m.createdAt,
    };
}

async function loadVendor(req, id) {
    assertId(id, "vendor id");
    const vendor = await Vendor.findById(id);
    if (!vendor) throw httpError(404, "Vendor not found");
    assertLocationAccess(req, vendor.locationId);
    return vendor;
}

async function loadProduct(req, id) {
    assertId(id, "product id");
    const product = await Product.findById(id);
    if (!product) throw httpError(404, "Product not found");
    assertLocationAccess(req, product.locationId);
    return product;
}

function auditSafe(req, action, targetType, targetId, meta) {
    return writeAudit({
        action,
        actor: req.user._id,
        actorRole: req.user.role,
        targetType,
        targetId,
        meta,
        req,
    });
}

// ── POS bootstrap ────────────────────────────────────────────────────────────

/** Everything the POS screen needs for one branch in a single call. */
const getPosCatalog = async (req, res) => {
    try {
        const locationId = await resolveLocationId(req);
        await ensureDefaultCategories();
        await ensureInHouseVendor(locationId, req.user._id);

        const [categories, vendors, products] = await Promise.all([
            ProductCategory.find({ active: true }).sort({ section: 1, sortOrder: 1, name: 1 }).lean(),
            Vendor.find({ locationId, active: true }).sort({ type: 1, name: 1 }).lean(),
            Product.find({ locationId, active: true }).sort({ name: 1 }).lean(),
        ]);

        res.json({
            locationId,
            categories: categories.map(serializeCategory),
            vendors: vendors.map(serializeVendor),
            products: products.map(serializeProduct),
        });
    } catch (error) {
        fail(res, error);
    }
};

// ── Vendors ──────────────────────────────────────────────────────────────────

const listVendors = async (req, res) => {
    try {
        const filter = locationFilterFor(req);
        if (req.locationScope?.mode === "one" || req.query.locationId) {
            const locationId = await resolveLocationId(req);
            filter.locationId = oid(locationId);
            await ensureInHouseVendor(locationId, req.user._id);
        }
        if (req.query.active === "true") filter.active = true;
        if (req.query.active === "false") filter.active = false;
        const vendors = await Vendor.find(filter).sort({ type: 1, name: 1 }).lean();
        res.json({ vendors: vendors.map(serializeVendor) });
    } catch (error) {
        fail(res, error);
    }
};

const createVendor = async (req, res) => {
    try {
        const locationId = await resolveLocationId(req, req.body.locationId);
        const { name, type, contactName, phone, email, notes, commissionPercent } = req.body;
        const vendor = await Vendor.create({
            locationId,
            name,
            type,
            contactName: contactName || "",
            phone: phone || "",
            email: email || "",
            notes: notes || "",
            commissionPercent: type === "in_house" ? 100 : commissionPercent,
            createdBy: req.user._id,
        });
        await auditSafe(req, "vendor_created", "vendor", vendor._id, { name, type, commissionPercent: vendor.commissionPercent });
        res.status(201).json({ vendor: serializeVendor(vendor.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

const updateVendor = async (req, res) => {
    try {
        const vendor = await loadVendor(req, req.params.id);
        const before = { commissionPercent: vendor.commissionPercent, active: vendor.active };
        for (const key of ["name", "contactName", "phone", "email", "notes", "active"]) {
            if (req.body[key] !== undefined) vendor[key] = req.body[key];
        }
        if (req.body.commissionPercent !== undefined && vendor.type !== "in_house") {
            vendor.commissionPercent = req.body.commissionPercent;
        }
        if (vendor.type === "in_house" && vendor.active === false) {
            throw httpError(400, "The gym's own bar vendor cannot be deactivated");
        }
        await vendor.save();
        await auditSafe(req, "vendor_updated", "vendor", vendor._id, {
            before,
            after: { commissionPercent: vendor.commissionPercent, active: vendor.active },
        });
        res.json({ vendor: serializeVendor(vendor.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

/** Vendors are never hard-deleted: sales keep their snapshot, so this deactivates. */
const deleteVendor = async (req, res) => {
    try {
        const vendor = await loadVendor(req, req.params.id);
        if (vendor.type === "in_house") {
            throw httpError(400, "The gym's own bar vendor cannot be deactivated");
        }
        vendor.active = false;
        await vendor.save();
        await Product.updateMany({ vendorId: vendor._id }, { $set: { active: false } });
        await auditSafe(req, "vendor_updated", "vendor", vendor._id, { active: false });
        res.json({ vendor: serializeVendor(vendor.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

// ── Categories ───────────────────────────────────────────────────────────────

const listCategories = async (req, res) => {
    try {
        await ensureDefaultCategories();
        const filter = {};
        if (req.query.active === "true") filter.active = true;
        if (req.query.section === "bar" || req.query.section === "retail") filter.section = req.query.section;
        const categories = await ProductCategory.find(filter).sort({ section: 1, sortOrder: 1, name: 1 }).lean();
        res.json({ categories: categories.map(serializeCategory) });
    } catch (error) {
        fail(res, error);
    }
};

const createCategory = async (req, res) => {
    try {
        const last = await ProductCategory.findOne({}).sort({ sortOrder: -1 }).select("sortOrder").lean();
        const category = await ProductCategory.create({
            name: req.body.name,
            section: req.body.section,
            sortOrder: req.body.sortOrder ?? (last ? (last.sortOrder || 0) + 1 : 0),
        });
        res.status(201).json({ category: serializeCategory(category.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

const updateCategory = async (req, res) => {
    try {
        assertId(req.params.id, "category id");
        const category = await ProductCategory.findById(req.params.id);
        if (!category) throw httpError(404, "Category not found");
        for (const key of ["name", "section", "sortOrder", "active"]) {
            if (req.body[key] !== undefined) category[key] = req.body[key];
        }
        await category.save();
        res.json({ category: serializeCategory(category.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

// ── Products ─────────────────────────────────────────────────────────────────

const listProducts = async (req, res) => {
    try {
        const filter = locationFilterFor(req);
        if (req.locationScope?.mode === "one" || req.query.locationId) {
            filter.locationId = oid(await resolveLocationId(req));
        }
        if (req.query.active === "true") filter.active = true;
        if (req.query.active === "false") filter.active = false;
        if (req.query.categoryId) {
            assertId(req.query.categoryId, "category id");
            filter.categoryId = oid(req.query.categoryId);
        }
        if (req.query.vendorId) {
            assertId(req.query.vendorId, "vendor id");
            filter.vendorId = oid(req.query.vendorId);
        }
        if (req.query.q) {
            const q = String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [{ name: { $regex: q, $options: "i" } }, { sku: { $regex: q, $options: "i" } }];
        }
        if (req.query.lowStock === "true") {
            filter.trackStock = true;
            filter.$expr = { $lte: ["$stockQty", "$lowStockThreshold"] };
        }

        const products = await Product.find(filter).sort({ name: 1 }).limit(2000).lean();
        res.json({ products: products.map(serializeProduct) });
    } catch (error) {
        fail(res, error);
    }
};

async function assertVendorAndCategory(locationId, { vendorId, categoryId }) {
    let vendor = null;
    let category = null;
    if (vendorId) {
        vendor = await Vendor.findOne({ _id: vendorId, locationId });
        if (!vendor) throw httpError(400, "Vendor not found at this branch");
        if (!vendor.active) throw httpError(400, "That vendor is inactive");
    }
    if (categoryId) {
        category = await ProductCategory.findById(categoryId);
        if (!category) throw httpError(400, "Category not found");
    }
    return { vendor, category };
}

const createProduct = async (req, res) => {
    try {
        const locationId = await resolveLocationId(req, req.body.locationId);
        const body = req.body;
        let vendorId = body.vendorId;
        if (!vendorId) {
            vendorId = String((await ensureInHouseVendor(locationId, req.user._id))._id);
        }
        const { category } = await assertVendorAndCategory(locationId, { vendorId, categoryId: body.categoryId });

        // Retail goods are counted by default; made-to-order bar items are not.
        const trackStock = body.trackStock ?? category.section === "retail";
        const product = await Product.create({
            locationId,
            name: body.name,
            categoryId: body.categoryId,
            vendorId,
            price: body.price,
            sku: body.sku || "",
            trackStock,
            stockQty: trackStock ? body.stockQty : 0,
            lowStockThreshold: trackStock ? body.lowStockThreshold : 0,
            imageUrl: body.imageUrl || "",
            createdBy: req.user._id,
        });

        if (trackStock && product.stockQty > 0) {
            await StockMovement.create({
                locationId,
                productId: product._id,
                type: "restock",
                qty: product.stockQty,
                balanceAfter: product.stockQty,
                reason: "Opening stock",
                createdBy: req.user._id,
            });
        }
        await auditSafe(req, "product_created", "product", product._id, {
            name: product.name,
            price: product.price,
            vendorId,
        });
        res.status(201).json({ product: serializeProduct(product.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

const updateProduct = async (req, res) => {
    try {
        const product = await loadProduct(req, req.params.id);
        const body = req.body;
        await assertVendorAndCategory(product.locationId, {
            vendorId: body.vendorId && String(body.vendorId) !== String(product.vendorId) ? body.vendorId : null,
            categoryId: body.categoryId,
        });
        const before = { price: product.price, vendorId: String(product.vendorId), active: product.active };
        for (const key of ["name", "categoryId", "vendorId", "price", "trackStock", "lowStockThreshold", "active"]) {
            if (body[key] !== undefined) product[key] = body[key];
        }
        if (body.sku !== undefined) product.sku = body.sku || "";
        if (body.imageUrl !== undefined) product.imageUrl = body.imageUrl || "";
        await product.save();
        await auditSafe(req, "product_updated", "product", product._id, {
            before,
            after: { price: product.price, vendorId: String(product.vendorId), active: product.active },
        });
        res.json({ product: serializeProduct(product.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

const deleteProduct = async (req, res) => {
    try {
        const product = await loadProduct(req, req.params.id);
        product.active = false;
        await product.save();
        await auditSafe(req, "product_updated", "product", product._id, { active: false });
        res.json({ product: serializeProduct(product.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

/** Restock (+) or manual correction (+/-). Never lets stock go below zero. */
const changeStock = async (req, res) => {
    try {
        const product = await loadProduct(req, req.params.id);
        if (!product.trackStock) {
            throw httpError(400, "Stock tracking is off for this product");
        }
        const { mode, qty, reason } = req.body;
        const filter = { _id: product._id };
        if (qty < 0) filter.stockQty = { $gte: -qty };
        const updated = await Product.findOneAndUpdate(filter, { $inc: { stockQty: qty } }, { new: true });
        if (!updated) throw httpError(409, "Stock cannot go below zero");

        await StockMovement.create({
            locationId: product.locationId,
            productId: product._id,
            type: mode === "restock" ? "restock" : "adjustment",
            qty,
            balanceAfter: updated.stockQty,
            reason: reason || "",
            createdBy: req.user._id,
        });
        await auditSafe(req, "stock_adjusted", "product", product._id, { mode, qty, balanceAfter: updated.stockQty });
        res.json({ product: serializeProduct(updated.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

const getProductMovements = async (req, res) => {
    try {
        const product = await loadProduct(req, req.params.id);
        const movements = await StockMovement.find({ productId: product._id })
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("createdBy", "name username")
            .lean();
        res.json({ movements: movements.map(serializeMovement) });
    } catch (error) {
        fail(res, error);
    }
};

/** Whether a product or vendor already has sales (used by the UI to hint deactivate vs edit). */
const getProductUsage = async (req, res) => {
    try {
        const product = await loadProduct(req, req.params.id);
        const sold = await Sale.countDocuments({ "items.productId": product._id });
        res.json({ sales: sold });
    } catch (error) {
        fail(res, error);
    }
};

module.exports = {
    serializeProduct,
    serializeVendor,
    getPosCatalog,
    listVendors,
    createVendor,
    updateVendor,
    deleteVendor,
    listCategories,
    createCategory,
    updateCategory,
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    changeStock,
    getProductMovements,
    getProductUsage,
};
