import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const ProductCategory = require("../models/ProductCategory");
const StockMovement = require("../models/StockMovement");
const Sale = require("../models/Sale");
const VendorPayout = require("../models/VendorPayout");
const Counter = require("../models/Counter");
const Location = require("../models/Location");
const AuditLog = require("../models/AuditLog");
const Member = require("../models/Member");
const { runWithTenant } = require("../context/tenantContext");
const { createSale, refundSale } = require("../controllers/retailSalesController");
const { createPayout } = require("../controllers/retailReportController");
const { createSaleSchema, stockChangeSchema, createVendorSchema } = require("../validation/schemas");

const id = () => new mongoose.Types.ObjectId();

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
    };
}

const leanQuery = (rows) => ({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(rows),
});

describe("Retail POS", () => {
    const tenantId = new mongoose.Types.ObjectId().toString();
    const locationId = id();

    const reqFor = (body, extra = {}) => ({
        body,
        query: {},
        params: {},
        user: { _id: id(), role: "Owner", tenantId },
        tenant: {},
        locationScope: { mode: "one", locationId: String(locationId) },
        ...extra,
    });

    const run = (fn) => runWithTenant({ tenantId }, fn);

    describe("models", () => {
        const models = { Vendor, ProductCategory, Product, StockMovement, Sale, VendorPayout };

        it("stamps every retail model with a required tenantId", () => {
            for (const [name, model] of Object.entries(models)) {
                const path = model.schema.path("tenantId");
                expect(path, name).toBeTruthy();
                expect(path.isRequired, name).toBe(true);
            }
        });

        it("scopes every retail model query by tenant through the plugin hooks", () => {
            for (const [name, model] of Object.entries(models)) {
                expect(model.schema.s.hooks._pres.get("find")?.length, name).toBeGreaterThan(0);
                expect(model.schema.s.hooks._pres.get("aggregate")?.length, name).toBeGreaterThan(0);
            }
        });

        it("keeps receipt numbers unique per gym, not globally", () => {
            const unique = Sale.schema.indexes().find(([keys, opts]) => keys.receiptNumber === 1 && opts.unique);
            expect(unique[0].tenantId).toBe(1);
        });

        it("refuses a throwing query without a tenant context", async () => {
            await expect(Product.find({})).rejects.toThrow(/TenantContext/i);
        });
    });

    describe("validation", () => {
        it("rejects empty carts, zero quantities and unknown payment methods", () => {
            const base = { items: [{ productId: String(id()), qty: 1 }] };
            expect(createSaleSchema.safeParse(base).success).toBe(true);
            expect(createSaleSchema.safeParse({ items: [] }).success).toBe(false);
            expect(createSaleSchema.safeParse({ items: [{ productId: String(id()), qty: 0 }] }).success).toBe(false);
            expect(createSaleSchema.safeParse({ ...base, paymentMethod: "crypto" }).success).toBe(false);
            expect(createSaleSchema.safeParse({ ...base, discount: -5 }).success).toBe(false);
        });

        it("requires a positive restock and a non-zero adjustment", () => {
            expect(stockChangeSchema.safeParse({ mode: "restock", qty: 10 }).success).toBe(true);
            expect(stockChangeSchema.safeParse({ mode: "restock", qty: -1 }).success).toBe(false);
            expect(stockChangeSchema.safeParse({ mode: "adjust", qty: -3 }).success).toBe(true);
            expect(stockChangeSchema.safeParse({ mode: "adjust", qty: 0 }).success).toBe(false);
        });

        it("limits the commission to 0-100", () => {
            expect(createVendorSchema.safeParse({ name: "Brand", commissionPercent: 20 }).success).toBe(true);
            expect(createVendorSchema.safeParse({ name: "Brand", commissionPercent: 101 }).success).toBe(false);
        });
    });

    describe("createSale", () => {
        const vendorId = id();
        const barVendorId = id();
        const categoryId = id();
        const whey = { _id: id(), name: "Whey 2kg", price: 1000, vendorId, categoryId, trackStock: true, stockQty: 5, active: true };
        const shake = { _id: id(), name: "Protein Shake", price: 60, vendorId: barVendorId, categoryId, trackStock: false, stockQty: 0, active: true };
        const vendors = [
            { _id: vendorId, name: "Muscle Brand", commissionPercent: 20, active: true },
            { _id: barVendorId, name: "Gym Bar", commissionPercent: 100, active: true },
        ];

        let updateOne;
        let created;

        beforeEach(() => {
            vi.restoreAllMocks();
            created = null;
            vi.spyOn(Location, "findById").mockReturnValue(leanQuery({ _id: locationId }));
            vi.spyOn(Product, "find").mockImplementation((query) => {
                if (query?._id?.$in && query.locationId) {
                    return { lean: vi.fn().mockResolvedValue([whey, shake].filter((p) => query._id.$in.includes(String(p._id)))) };
                }
                return { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([{ _id: whey._id, stockQty: 3 }]) };
            });
            vi.spyOn(Vendor, "find").mockReturnValue({ lean: vi.fn().mockResolvedValue(vendors) });
            vi.spyOn(Counter, "findOneAndUpdate").mockResolvedValue({ seq: 42 });
            updateOne = vi.spyOn(Product, "updateOne").mockResolvedValue({ modifiedCount: 1 });
            vi.spyOn(Sale, "create").mockImplementation(async (doc) => {
                created = doc;
                return { _id: id(), ...doc, toObject() { return { _id: this._id, ...doc }; } };
            });
            vi.spyOn(StockMovement, "insertMany").mockResolvedValue([]);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});
        });

        const body = (items, extra = {}) => ({ discount: 0, paymentMethod: "cash", ...extra, items });

        it("snapshots price and commission, splits vendor and gym shares, and decrements tracked stock", async () => {
            const res = mockRes();
            await run(() =>
                createSale(reqFor(body([{ productId: String(whey._id), qty: 2 }, { productId: String(shake._id), qty: 3 }])), res)
            );

            expect(res.statusCode).toBe(201);
            expect(created.receiptNumber).toBe(42);
            expect(created.total).toBe(2180);
            // Gym keeps 100% of the bar item and 20% of the supplement.
            expect(created.gymShare).toBe(180 + 400);
            expect(created.vendorShare).toBe(1600);
            const wheyLine = created.items.find((i) => String(i.productId) === String(whey._id));
            expect(wheyLine).toMatchObject({ unitPrice: 1000, commissionPercent: 20, vendorName: "Muscle Brand", trackedStock: true });

            // Only the tracked product is decremented, conditionally on enough stock.
            expect(updateOne).toHaveBeenCalledTimes(1);
            expect(updateOne.mock.calls[0][0]).toMatchObject({ trackStock: true, stockQty: { $gte: 2 } });
            expect(updateOne.mock.calls[0][1]).toEqual({ $inc: { stockQty: -2 } });
        });

        it("rejects an oversell and puts back stock it already reserved", async () => {
            const other = { ...whey, _id: id(), name: "Creatine" };
            Product.find.mockImplementation((query) => ({
                lean: vi.fn().mockResolvedValue([whey, other].filter((p) => query._id.$in.includes(String(p._id)))),
            }));
            updateOne.mockReset();
            updateOne
                .mockResolvedValueOnce({ modifiedCount: 1 }) // first line reserved
                .mockResolvedValueOnce({ modifiedCount: 0 }) // second line is short
                .mockResolvedValue({ modifiedCount: 1 }); // releases

            const res = mockRes();
            await run(() =>
                createSale(reqFor(body([{ productId: String(whey._id), qty: 1 }, { productId: String(other._id), qty: 99 }])), res)
            );

            expect(res.statusCode).toBe(409);
            expect(res.body.code).toBe("INSUFFICIENT_STOCK");
            expect(Sale.create).not.toHaveBeenCalled();
            const release = updateOne.mock.calls.find(([, update]) => update.$inc.stockQty > 0);
            expect(release[0]._id).toEqual(whey._id);
            expect(release[1]).toEqual({ $inc: { stockQty: 1 } });
        });

        it("releases reserved stock when saving the sale fails", async () => {
            Sale.create.mockRejectedValue(new Error("db down"));
            const res = mockRes();
            await run(() => createSale(reqFor(body([{ productId: String(whey._id), qty: 2 }])), res));
            expect(res.statusCode).toBe(500);
            const releases = updateOne.mock.calls.filter(([, update]) => update.$inc.stockQty > 0);
            expect(releases).toHaveLength(1);
        });

        it("refuses products from another branch or tenant", async () => {
            const res = mockRes();
            await run(() => createSale(reqFor(body([{ productId: String(id()), qty: 1 }])), res));
            expect(res.statusCode).toBe(400);
            expect(Sale.create).not.toHaveBeenCalled();
        });

        it("rejects a discount larger than the subtotal", async () => {
            const res = mockRes();
            await run(() =>
                createSale(reqFor(body([{ productId: String(shake._id), qty: 1 }], { discount: 500 })), res)
            );
            expect(res.statusCode).toBe(400);
        });

        it("links an existing member and rejects an unknown one", async () => {
            const memberId = id();
            vi.spyOn(Member, "findById").mockReturnValue(leanQuery({ _id: memberId, name: "Sara" }));
            const ok = mockRes();
            await run(() => createSale(reqFor(body([{ productId: String(shake._id), qty: 1 }], { memberId: String(memberId) })), ok));
            expect(ok.statusCode).toBe(201);
            expect(created.memberName).toBe("Sara");

            Member.findById.mockReturnValue(leanQuery(null));
            const bad = mockRes();
            await run(() => createSale(reqFor(body([{ productId: String(shake._id), qty: 1 }], { memberId: String(id()) })), bad));
            expect(bad.statusCode).toBe(400);
        });

        it("blocks a sale for an inactive vendor", async () => {
            Vendor.find.mockReturnValue({
                lean: vi.fn().mockResolvedValue([{ ...vendors[0], active: false }, vendors[1]]),
            });
            const res = mockRes();
            await run(() => createSale(reqFor(body([{ productId: String(whey._id), qty: 1 }])), res));
            expect(res.statusCode).toBe(400);
        });
    });

    describe("refundSale", () => {
        const saleId = id();
        const productId = id();
        const itemId = id();
        const makeSale = (overrides = {}) => {
            const doc = {
                _id: saleId,
                locationId,
                receiptNumber: 7,
                status: "completed",
                refundSeq: 0,
                refundedTotal: 0,
                refundedGymShare: 0,
                refundedVendorShare: 0,
                items: [
                    {
                        _id: itemId,
                        productId,
                        name: "Whey",
                        vendorId: id(),
                        qty: 3,
                        refundedQty: 0,
                        lineTotal: 90,
                        gymShare: 18,
                        vendorShare: 72,
                        trackedStock: true,
                    },
                ],
                ...overrides,
            };
            return { ...doc, toObject: () => JSON.parse(JSON.stringify(doc), (k, v) => (k === "_id" || k === "productId" || k === "vendorId" || k === "locationId" ? new mongoose.Types.ObjectId(v) : v)) };
        };

        let saleUpdate;
        beforeEach(() => {
            vi.restoreAllMocks();
            vi.spyOn(AuditLog, "create").mockResolvedValue({});
            vi.spyOn(StockMovement, "insertMany").mockResolvedValue([]);
            vi.spyOn(Product, "find").mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([{ _id: productId, stockQty: 3 }]),
            });
            saleUpdate = vi.spyOn(Sale, "updateOne").mockResolvedValue({ modifiedCount: 1 });
        });

        const mockLoad = (sale) =>
            vi.spyOn(Sale, "findById").mockReturnValue({ populate: vi.fn().mockResolvedValue(sale) });

        it("restocks tracked items and records a partial refund with exact shares", async () => {
            const sale = makeSale();
            mockLoad(sale);
            const productUpdate = vi.spyOn(Product, "updateOne").mockResolvedValue({ modifiedCount: 1 });

            const res = mockRes();
            await run(() =>
                refundSale(reqFor({ items: [{ itemId: String(itemId), qty: 1 }], reason: "Wrong flavour" }, { params: { id: String(saleId) } }), res)
            );

            expect(res.statusCode).toBe(200);
            const [filter, update] = saleUpdate.mock.calls[0];
            expect(filter.refundSeq).toBe(0);
            expect(update.$set.status).toBe("partially_refunded");
            expect(update.$set.refundedTotal).toBe(30);
            expect(update.$push.refunds).toMatchObject({ amount: 30, gymShare: 6, vendorShare: 24, reason: "Wrong flavour" });
            expect(productUpdate.mock.calls[0][1]).toEqual({ $inc: { stockQty: 1 } });
        });

        it("refunds everything when no items are sent and marks the sale refunded", async () => {
            mockLoad(makeSale());
            vi.spyOn(Product, "updateOne").mockResolvedValue({ modifiedCount: 1 });
            const res = mockRes();
            await run(() => refundSale(reqFor({}, { params: { id: String(saleId) } }), res));
            const update = saleUpdate.mock.calls[0][1];
            expect(update.$set.status).toBe("refunded");
            expect(update.$set.refundedTotal).toBe(90);
        });

        it("will not refund more units than were sold or refund twice", async () => {
            mockLoad(makeSale());
            const tooMany = mockRes();
            await run(() =>
                refundSale(reqFor({ items: [{ itemId: String(itemId), qty: 4 }] }, { params: { id: String(saleId) } }), tooMany)
            );
            expect(tooMany.statusCode).toBe(400);

            mockLoad(makeSale({ status: "refunded" }));
            const again = mockRes();
            await run(() => refundSale(reqFor({}, { params: { id: String(saleId) } }), again));
            expect(again.statusCode).toBe(400);
            expect(saleUpdate).not.toHaveBeenCalled();
        });

        it("fails the second of two concurrent refunds on the optimistic lock", async () => {
            mockLoad(makeSale());
            saleUpdate.mockResolvedValue({ modifiedCount: 0 });
            const productUpdate = vi.spyOn(Product, "updateOne").mockResolvedValue({ modifiedCount: 1 });
            const res = mockRes();
            await run(() => refundSale(reqFor({}, { params: { id: String(saleId) } }), res));
            expect(res.statusCode).toBe(409);
            expect(productUpdate).not.toHaveBeenCalled();
        });
    });

    describe("vendor payouts", () => {
        const vendorId = id();
        const vendor = { _id: vendorId, name: "Muscle Brand", type: "external", locationId };

        beforeEach(() => {
            vi.restoreAllMocks();
            vi.spyOn(Vendor, "findById").mockResolvedValue(vendor);
            vi.spyOn(AuditLog, "create").mockResolvedValue({});
        });

        const payoutReq = (body) => reqFor(body);

        it("rejects overlapping periods so a sale is never paid twice", async () => {
            vi.spyOn(VendorPayout, "findOne").mockReturnValue(
                leanQuery({ periodFrom: "2026-10-01", periodTo: "2026-10-15" })
            );
            const res = mockRes();
            await run(() =>
                createPayout(payoutReq({ vendorId: String(vendorId), periodFrom: "2026-10-10", periodTo: "2026-10-20" }), res)
            );
            expect(res.statusCode).toBe(409);
        });

        it("only pays completed days", async () => {
            const res = mockRes();
            const today = new Date().toISOString().slice(0, 10);
            await run(() =>
                createPayout(payoutReq({ vendorId: String(vendorId), periodFrom: "2026-10-01", periodTo: today }), res)
            );
            expect(res.statusCode).toBe(400);
        });

        it("creates a payout for the vendor share net of refunds", async () => {
            vi.spyOn(VendorPayout, "findOne").mockReturnValue(leanQuery(null));
            vi.spyOn(Sale, "aggregate").mockResolvedValue([
                { _id: "2026-10-02", gross: 500, gymShare: 100, vendorShare: 400 },
                { _id: "2026-10-03", gross: 250, gymShare: 50, vendorShare: 200 },
            ]);
            const create = vi.spyOn(VendorPayout, "create").mockImplementation(async (doc) => ({
                _id: id(),
                ...doc,
                toObject() { return { _id: this._id, ...doc }; },
            }));
            const res = mockRes();
            await run(() =>
                createPayout(payoutReq({ vendorId: String(vendorId), periodFrom: "2026-10-01", periodTo: "2026-10-05" }), res)
            );
            expect(res.statusCode).toBe(201);
            expect(create.mock.calls[0][0]).toMatchObject({ amount: 600, grossSales: 750, gymShare: 150 });
        });

        it("does not pay in-house vendors", async () => {
            Vendor.findById.mockResolvedValue({ ...vendor, type: "in_house" });
            const res = mockRes();
            await run(() =>
                createPayout(payoutReq({ vendorId: String(vendorId), periodFrom: "2026-10-01", periodTo: "2026-10-05" }), res)
            );
            expect(res.statusCode).toBe(400);
        });
    });
});
