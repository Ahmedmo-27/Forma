const mongoose = require("mongoose");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Sale = require("../models/Sale");
const StockMovement = require("../models/StockMovement");
const Member = require("../models/Member");
const { nextSequence } = require("../utils/sequence");
const { writeAudit } = require("../utils/audit");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { cairoDayBounds } = require("../utils/revenueUtils");
const { computeSaleTotals, proportionalRefund, roundMoney } = require("../utils/retailMath");
const {
    httpError,
    fail,
    assertId,
    assertLocationAccess,
    resolveLocationId,
    locationFilterFor,
} = require("../services/retailService");

const oid = (id) => new mongoose.Types.ObjectId(String(id));

function serializeSale(sale) {
    return {
        _id: String(sale._id),
        receiptNumber: sale.receiptNumber,
        locationId: String(sale.locationId),
        items: (sale.items || []).map((item) => ({
            _id: String(item._id),
            productId: String(item.productId),
            name: item.name,
            vendorId: String(item.vendorId),
            vendorName: item.vendorName || "",
            unitPrice: item.unitPrice,
            qty: item.qty,
            refundedQty: item.refundedQty || 0,
            lineTotal: item.lineTotal,
            gymShare: item.gymShare,
            vendorShare: item.vendorShare,
            refundedAmount: item.refundedAmount || 0,
        })),
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        gymShare: sale.gymShare,
        vendorShare: sale.vendorShare,
        paymentMethod: sale.paymentMethod,
        memberId: sale.memberId ? String(sale.memberId._id || sale.memberId) : null,
        memberName: sale.memberName || "",
        note: sale.note || "",
        status: sale.status,
        refundedTotal: sale.refundedTotal || 0,
        refunds: sale.refunds || [],
        cashier: sale.cashier
            ? { _id: String(sale.cashier._id || sale.cashier), name: sale.cashier.name || sale.cashier.username || "" }
            : null,
        createdAt: sale.createdAt,
    };
}

function audit(req, action, saleId, meta) {
    return writeAudit({
        action,
        actor: req.user._id,
        actorRole: req.user.role,
        targetType: "sale",
        targetId: saleId,
        meta,
        req,
    });
}

/** Put back stock that was reserved for a sale that did not complete. */
async function releaseReserved(reserved) {
    await Promise.all(
        reserved.map((r) =>
            Product.updateOne({ _id: r.productId }, { $inc: { stockQty: r.qty } }).catch(() => {})
        )
    );
}

const createSale = async (req, res) => {
    const reserved = [];
    try {
        const locationId = await resolveLocationId(req, req.body.locationId);
        const { discount, paymentMethod, memberId, note } = req.body;

        const qtyByProduct = new Map();
        for (const item of req.body.items) {
            qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.qty);
        }
        const productIds = [...qtyByProduct.keys()];
        const products = await Product.find({ _id: { $in: productIds }, locationId }).lean();
        if (products.length !== productIds.length) {
            throw httpError(400, "One or more products were not found at this branch");
        }
        const inactive = products.find((p) => p.active === false);
        if (inactive) throw httpError(400, `${inactive.name} is no longer on sale`);

        const vendors = await Vendor.find({ _id: { $in: products.map((p) => p.vendorId) } }).lean();
        const vendorById = new Map(vendors.map((v) => [String(v._id), v]));
        const inactiveVendor = products.find((p) => !vendorById.get(String(p.vendorId))?.active);
        if (inactiveVendor) throw httpError(400, `The vendor for ${inactiveVendor.name} is inactive`);

        let member = null;
        if (memberId) {
            member = await Member.findById(memberId).select("name").lean();
            if (!member) throw httpError(400, "Member not found");
        }

        const productById = new Map(products.map((p) => [String(p._id), p]));
        const lines = productIds.map((id) => {
            const product = productById.get(id);
            const vendor = vendorById.get(String(product.vendorId));
            return {
                product,
                vendor,
                qty: qtyByProduct.get(id),
                unitPrice: product.price,
                commissionPercent: vendor.commissionPercent,
            };
        });

        const totals = computeSaleTotals(lines, discount);
        if (roundMoney(discount) > totals.subtotal) {
            throw httpError(400, "Discount cannot be more than the sale subtotal");
        }

        // Reserve tracked stock with a conditional decrement so concurrent
        // sales cannot oversell. Undo on any failure below.
        for (const line of lines) {
            if (!line.product.trackStock) continue;
            const result = await Product.updateOne(
                { _id: line.product._id, locationId, trackStock: true, stockQty: { $gte: line.qty } },
                { $inc: { stockQty: -line.qty } }
            );
            if (result.modifiedCount !== 1) {
                throw httpError(409, `Not enough stock for ${line.product.name}`, "INSUFFICIENT_STOCK");
            }
            reserved.push({ productId: line.product._id, qty: line.qty });
        }

        const receiptNumber = await nextSequence("retailReceipt", 1);
        const sale = await Sale.create({
            locationId,
            receiptNumber,
            items: lines.map((line, index) => ({
                productId: line.product._id,
                name: line.product.name,
                categoryId: line.product.categoryId,
                vendorId: line.vendor._id,
                vendorName: line.vendor.name,
                unitPrice: line.unitPrice,
                qty: line.qty,
                trackedStock: line.product.trackStock === true,
                commissionPercent: line.commissionPercent,
                ...totals.lines[index],
            })),
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
            gymShare: totals.gymShare,
            vendorShare: totals.vendorShare,
            paymentMethod,
            memberId: member ? member._id : null,
            memberName: member?.name || "",
            note: note || "",
            cashier: req.user._id,
        }).catch(async (error) => {
            await releaseReserved(reserved);
            error.__released = true;
            throw error;
        });

        if (reserved.length) {
            const balances = await Product.find({ _id: { $in: reserved.map((r) => r.productId) } })
                .select("stockQty")
                .lean();
            const balanceById = new Map(balances.map((p) => [String(p._id), p.stockQty]));
            await StockMovement.insertMany(
                reserved.map((r) => ({
                    locationId,
                    productId: r.productId,
                    type: "sale",
                    qty: -r.qty,
                    balanceAfter: balanceById.get(String(r.productId)) ?? null,
                    reason: `Receipt #${receiptNumber}`,
                    saleId: sale._id,
                    createdBy: req.user._id,
                }))
            ).catch(() => {});
        }

        await audit(req, "sale_created", sale._id, {
            receiptNumber,
            total: sale.total,
            paymentMethod,
            memberId: member ? String(member._id) : null,
        });

        res.status(201).json({ sale: serializeSale(sale.toObject()) });
    } catch (error) {
        if (reserved.length && !error.__released) await releaseReserved(reserved).catch(() => {});
        fail(res, error);
    }
};

const listSales = async (req, res) => {
    try {
        const filter = locationFilterFor(req);
        if (req.locationScope?.mode === "one" || req.query.locationId) {
            filter.locationId = oid(await resolveLocationId(req));
        }
        if (req.query.dateFrom || req.query.dateTo) {
            const { start, end } = cairoDayBounds(req.query.dateFrom, req.query.dateTo);
            filter.createdAt = { $gte: start, $lte: end };
        }
        if (req.query.vendorId) {
            assertId(req.query.vendorId, "vendor id");
            filter["items.vendorId"] = oid(req.query.vendorId);
        }
        if (req.query.memberId) {
            assertId(req.query.memberId, "member id");
            filter.memberId = oid(req.query.memberId);
        }
        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.receipt && /^\d+$/.test(String(req.query.receipt))) {
            filter.receiptNumber = Number(req.query.receipt);
        }

        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
        const [sales, total] = await Promise.all([
            Sale.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("cashier", "name username")
                .lean(),
            Sale.countDocuments(filter),
        ]);
        res.json({ sales: sales.map(serializeSale), pagination: buildPagination(page, limit, total) });
    } catch (error) {
        fail(res, error);
    }
};

async function loadSale(req, id) {
    assertId(id, "sale id");
    const sale = await Sale.findById(id).populate("cashier", "name username");
    if (!sale) throw httpError(404, "Sale not found");
    assertLocationAccess(req, sale.locationId);
    return sale;
}

const getSale = async (req, res) => {
    try {
        const sale = await loadSale(req, req.params.id);
        res.json({ sale: serializeSale(sale.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

/**
 * Full refund when no items are sent, otherwise per line item quantities.
 * Amounts use cumulative proportional rounding so a full refund returns
 * exactly what was charged.
 */
const refundSale = async (req, res) => {
    try {
        const sale = await loadSale(req, req.params.id);
        if (sale.status === "refunded") throw httpError(400, "This sale was already fully refunded");

        const plain = sale.toObject();
        const requested = req.body.items
            ? req.body.items
            : plain.items
                .filter((item) => item.qty - (item.refundedQty || 0) > 0)
                .map((item) => ({ itemId: String(item._id), qty: item.qty - (item.refundedQty || 0) }));

        const merged = new Map();
        for (const r of requested) merged.set(r.itemId, (merged.get(r.itemId) || 0) + r.qty);

        let amount = 0;
        let gym = 0;
        let vendor = 0;
        const restock = [];
        for (const [itemId, qty] of merged) {
            const item = plain.items.find((it) => String(it._id) === itemId);
            if (!item) throw httpError(400, "Refund item is not part of this sale");
            const already = item.refundedQty || 0;
            if (qty > item.qty - already) {
                throw httpError(400, `Cannot refund more than was sold for ${item.name}`);
            }
            const a = proportionalRefund(item.lineTotal, item.qty, already, qty);
            const g = proportionalRefund(item.gymShare, item.qty, already, qty);
            const v = proportionalRefund(item.vendorShare, item.qty, already, qty);
            item.refundedQty = already + qty;
            item.refundedAmount = roundMoney((item.refundedAmount || 0) + a);
            item.refundedGymShare = roundMoney((item.refundedGymShare || 0) + g);
            item.refundedVendorShare = roundMoney((item.refundedVendorShare || 0) + v);
            amount += a;
            gym += g;
            vendor += v;
            if (item.trackedStock) restock.push({ productId: item.productId, qty });
        }
        if (!merged.size) throw httpError(400, "Nothing left to refund on this sale");

        const fullyRefunded = plain.items.every((item) => item.refundedQty >= item.qty);
        const reason = req.body.reason || "";
        const result = await Sale.updateOne(
            { _id: sale._id, refundSeq: plain.refundSeq || 0 },
            {
                $set: {
                    items: plain.items,
                    status: fullyRefunded ? "refunded" : "partially_refunded",
                    refundedTotal: roundMoney((plain.refundedTotal || 0) + amount),
                    refundedGymShare: roundMoney((plain.refundedGymShare || 0) + gym),
                    refundedVendorShare: roundMoney((plain.refundedVendorShare || 0) + vendor),
                },
                $inc: { refundSeq: 1 },
                $push: {
                    refunds: {
                        at: new Date(),
                        by: req.user._id,
                        reason,
                        amount: roundMoney(amount),
                        gymShare: roundMoney(gym),
                        vendorShare: roundMoney(vendor),
                    },
                },
            }
        );
        if (result.modifiedCount !== 1) {
            throw httpError(409, "This sale was just changed by someone else. Reload and try again.");
        }

        if (restock.length) {
            await Promise.all(
                restock.map((r) =>
                    Product.updateOne({ _id: r.productId, trackStock: true }, { $inc: { stockQty: r.qty } })
                )
            );
            const balances = await Product.find({ _id: { $in: restock.map((r) => r.productId) } })
                .select("stockQty")
                .lean();
            const balanceById = new Map(balances.map((p) => [String(p._id), p.stockQty]));
            await StockMovement.insertMany(
                restock.map((r) => ({
                    locationId: sale.locationId,
                    productId: r.productId,
                    type: "refund",
                    qty: r.qty,
                    balanceAfter: balanceById.get(String(r.productId)) ?? null,
                    reason: `Refund of receipt #${sale.receiptNumber}`,
                    saleId: sale._id,
                    createdBy: req.user._id,
                }))
            ).catch(() => {});
        }

        await audit(req, "sale_refunded", sale._id, {
            receiptNumber: sale.receiptNumber,
            amount: roundMoney(amount),
            full: fullyRefunded,
            reason,
        });

        const fresh = await loadSale(req, sale._id);
        res.json({ sale: serializeSale(fresh.toObject()) });
    } catch (error) {
        fail(res, error);
    }
};

module.exports = { createSale, listSales, getSale, refundSale, serializeSale };
