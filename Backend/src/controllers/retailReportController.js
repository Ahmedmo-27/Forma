const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Vendor = require("../models/Vendor");
const Product = require("../models/Product");
const VendorPayout = require("../models/VendorPayout");
const { writeAudit } = require("../utils/audit");
const { cairoDayBounds, dayKey, addLocalDays, CAIRO_ZONE } = require("../utils/revenueUtils");
const { summarizeSales, roundMoney } = require("../utils/retailMath");
const {
    httpError,
    fail,
    assertId,
    assertLocationAccess,
    resolveLocationId,
    locationFilterFor,
} = require("../services/retailService");

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const MAX_RANGE_DAYS = 366;

function daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

async function scopedSaleFilter(req) {
    const filter = locationFilterFor(req);
    if (req.locationScope?.mode === "one" || req.query.locationId) {
        filter.locationId = oid(await resolveLocationId(req));
    }
    return filter;
}

/**
 * Revenue for the gym: total across every vendor, per vendor, top products and a
 * daily series. Dates are Cairo days; refunds are netted against their sale.
 */
const getSummary = async (req, res) => {
    try {
        const today = dayKey(new Date());
        const dateFrom = req.query.dateFrom || addLocalDays(today, -29);
        const dateTo = req.query.dateTo || today;
        for (const value of [dateFrom, dateTo]) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw httpError(400, "Dates must be YYYY-MM-DD");
        }
        if (dateFrom > dateTo) throw httpError(400, "The start date must be before the end date");
        if (daysBetween(dateFrom, dateTo) > MAX_RANGE_DAYS) {
            throw httpError(400, `Choose a range of ${MAX_RANGE_DAYS} days or less`);
        }

        const filter = await scopedSaleFilter(req);
        const { start, end } = cairoDayBounds(dateFrom, dateTo);
        filter.createdAt = { $gte: start, $lte: end };

        const options = {};
        if (req.query.vendorId) {
            assertId(req.query.vendorId, "vendor id");
            options.vendorId = req.query.vendorId;
        }
        if (req.query.categoryId) {
            assertId(req.query.categoryId, "category id");
            options.categoryId = req.query.categoryId;
        }
        if (options.vendorId) filter["items.vendorId"] = oid(options.vendorId);

        const sales = await Sale.find(filter)
            .select("createdAt paymentMethod items")
            .limit(50000)
            .lean();
        const summary = summarizeSales(sales, options);

        // Vendors with no sales in the range still show up with zeros.
        const vendorFilter = locationFilterFor(req);
        if (filter.locationId) vendorFilter.locationId = filter.locationId;
        const vendors = await Vendor.find(vendorFilter).select("name type commissionPercent active").lean();
        const known = new Map(summary.vendors.map((row) => [row.vendorId, row]));
        const vendorRows = vendors
            .filter((v) => !options.vendorId || String(v._id) === String(options.vendorId))
            .map((v) => ({
                ...(known.get(String(v._id)) || {
                    vendorId: String(v._id),
                    vendorName: v.name,
                    gross: 0,
                    refunded: 0,
                    net: 0,
                    gymShare: 0,
                    vendorShare: 0,
                    units: 0,
                    sales: 0,
                }),
                vendorName: v.name,
                type: v.type,
                commissionPercent: v.commissionPercent,
                active: v.active !== false,
            }))
            .sort((a, b) => b.net - a.net || a.vendorName.localeCompare(b.vendorName));

        const stockFilter = { trackStock: true, active: true, ...locationFilterFor(req) };
        if (filter.locationId) stockFilter.locationId = filter.locationId;
        const lowStockCount = await Product.countDocuments({
            ...stockFilter,
            $expr: { $lte: ["$stockQty", "$lowStockThreshold"] },
        });

        res.json({
            range: { dateFrom, dateTo },
            totals: summary.totals,
            vendors: vendorRows,
            topProducts: summary.products.slice(0, 20),
            daily: summary.daily,
            paymentMethods: summary.paymentMethods,
            lowStockCount,
        });
    } catch (error) {
        fail(res, error);
    }
};

// ── Vendor payouts ───────────────────────────────────────────────────────────

/** Vendor share per Cairo day (net of refunds) for one vendor at one branch. */
async function vendorShareByDay(vendor, { from = null, to = null } = {}) {
    const match = { locationId: vendor.locationId, "items.vendorId": vendor._id };
    if (from || to) {
        const { start, end } = cairoDayBounds(from || "1970-01-01", to || dayKey(new Date()));
        match.createdAt = { $gte: start, $lte: end };
    }
    const { withQueryMaxTime } = require("../config/queryBudgets");
    const rows = await withQueryMaxTime(Sale.aggregate([
        { $match: match },
        { $unwind: "$items" },
        { $match: { "items.vendorId": vendor._id } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: CAIRO_ZONE } },
                gross: { $sum: { $subtract: ["$items.lineTotal", { $ifNull: ["$items.refundedAmount", 0] }] } },
                gymShare: {
                    $sum: { $subtract: ["$items.gymShare", { $ifNull: ["$items.refundedGymShare", 0] }] },
                },
                vendorShare: {
                    $sum: { $subtract: ["$items.vendorShare", { $ifNull: ["$items.refundedVendorShare", 0] }] },
                },
            },
        },
    ]));
    return rows.map((r) => ({ date: r._id, gross: r.gross, gymShare: r.gymShare, vendorShare: r.vendorShare }));
}

function serializePayout(p, vendorName = "") {
    return {
        _id: String(p._id),
        vendorId: String(p.vendorId),
        vendorName,
        locationId: String(p.locationId),
        periodFrom: p.periodFrom,
        periodTo: p.periodTo,
        grossSales: p.grossSales,
        gymShare: p.gymShare,
        amount: p.amount,
        status: p.status,
        settledAt: p.settledAt,
        note: p.note || "",
        createdAt: p.createdAt,
    };
}

/**
 * Per external vendor: lifetime vendor share, what is settled, pending, and what
 * is still unbilled (sales on days no payout covers yet).
 */
const getPayoutOverview = async (req, res) => {
    try {
        const vendorFilter = { ...locationFilterFor(req), type: "external" };
        if (req.locationScope?.mode === "one" || req.query.locationId) {
            vendorFilter.locationId = oid(await resolveLocationId(req));
        }
        const vendors = await Vendor.find(vendorFilter).sort({ name: 1 }).lean();
        const payouts = await VendorPayout.find({ vendorId: { $in: vendors.map((v) => v._id) } })
            .sort({ periodFrom: -1 })
            .lean();

        const rows = [];
        for (const vendor of vendors) {
            const mine = payouts.filter((p) => String(p.vendorId) === String(vendor._id));
            const days = await vendorShareByDay(vendor);
            const covered = (date) => mine.some((p) => date >= p.periodFrom && date <= p.periodTo);
            const lifetime = days.reduce((sum, d) => sum + d.vendorShare, 0);
            const unbilled = days.filter((d) => !covered(d.date)).reduce((sum, d) => sum + d.vendorShare, 0);
            rows.push({
                vendorId: String(vendor._id),
                vendorName: vendor.name,
                locationId: String(vendor.locationId),
                commissionPercent: vendor.commissionPercent,
                active: vendor.active !== false,
                lifetimeVendorShare: roundMoney(lifetime),
                unbilled: roundMoney(unbilled),
                pending: roundMoney(mine.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0)),
                settled: roundMoney(mine.filter((p) => p.status === "settled").reduce((s, p) => s + p.amount, 0)),
                lastPaidThrough: mine.reduce((max, p) => (p.periodTo > max ? p.periodTo : max), "") || null,
            });
        }

        const nameById = new Map(vendors.map((v) => [String(v._id), v.name]));
        res.json({
            vendors: rows,
            payouts: payouts.map((p) => serializePayout(p, nameById.get(String(p.vendorId)))),
        });
    } catch (error) {
        fail(res, error);
    }
};

const createPayout = async (req, res) => {
    try {
        const { vendorId, periodFrom, periodTo, note } = req.body;
        const vendor = await Vendor.findById(vendorId);
        if (!vendor) throw httpError(404, "Vendor not found");
        assertLocationAccess(req, vendor.locationId);
        if (vendor.type !== "external") throw httpError(400, "Only external vendors receive payouts");
        if (periodFrom > periodTo) throw httpError(400, "The start date must be before the end date");
        // Only finished days, so a sale made after the payout is never skipped.
        if (periodTo >= dayKey(new Date())) throw httpError(400, "Only completed days can be paid out");

        const overlap = await VendorPayout.findOne({
            vendorId: vendor._id,
            periodFrom: { $lte: periodTo },
            periodTo: { $gte: periodFrom },
        }).lean();
        if (overlap) {
            throw httpError(409, `This period overlaps an existing payout (${overlap.periodFrom} to ${overlap.periodTo})`);
        }

        const days = await vendorShareByDay(vendor, { from: periodFrom, to: periodTo });
        const amount = roundMoney(days.reduce((sum, d) => sum + d.vendorShare, 0));
        if (amount <= 0) throw httpError(400, "There is nothing to pay this vendor for that period");

        const payout = await VendorPayout.create({
            locationId: vendor.locationId,
            vendorId: vendor._id,
            periodFrom,
            periodTo,
            grossSales: roundMoney(days.reduce((sum, d) => sum + d.gross, 0)),
            gymShare: roundMoney(days.reduce((sum, d) => sum + d.gymShare, 0)),
            amount,
            note: note || "",
            createdBy: req.user._id,
        });
        await writeAudit({
            action: "vendor_payout_created",
            actor: req.user._id,
            actorRole: req.user.role,
            targetType: "vendor",
            targetId: vendor._id,
            meta: { payoutId: String(payout._id), periodFrom, periodTo, amount },
            req,
        });
        res.status(201).json({ payout: serializePayout(payout.toObject(), vendor.name) });
    } catch (error) {
        fail(res, error);
    }
};

async function loadPayout(req, id) {
    assertId(id, "payout id");
    const payout = await VendorPayout.findById(id);
    if (!payout) throw httpError(404, "Payout not found");
    assertLocationAccess(req, payout.locationId);
    return payout;
}

const settlePayout = async (req, res) => {
    try {
        const payout = await loadPayout(req, req.params.id);
        const updated = await VendorPayout.findOneAndUpdate(
            { _id: payout._id, status: "pending" },
            { $set: { status: "settled", settledAt: new Date(), settledBy: req.user._id } },
            { new: true }
        );
        if (!updated) throw httpError(409, "This payout was already settled");
        const vendor = await Vendor.findById(updated.vendorId).select("name").lean();
        await writeAudit({
            action: "vendor_payout_settled",
            actor: req.user._id,
            actorRole: req.user.role,
            targetType: "vendor",
            targetId: updated.vendorId,
            meta: { payoutId: String(updated._id), amount: updated.amount },
            req,
        });
        res.json({ payout: serializePayout(updated.toObject(), vendor?.name || "") });
    } catch (error) {
        fail(res, error);
    }
};

/** Cancel a payout that has not been paid yet; its days become unbilled again. */
const deletePayout = async (req, res) => {
    try {
        const payout = await loadPayout(req, req.params.id);
        const removed = await VendorPayout.deleteOne({ _id: payout._id, status: "pending" });
        if (removed.deletedCount !== 1) throw httpError(409, "Settled payouts cannot be removed");
        res.json({ ok: true });
    } catch (error) {
        fail(res, error);
    }
};

module.exports = { getSummary, getPayoutOverview, createPayout, settlePayout, deletePayout };
