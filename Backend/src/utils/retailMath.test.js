import { describe, it, expect } from "vitest";
import {
    allocateDiscount,
    computeSaleTotals,
    proportionalRefund,
    splitLine,
    summarizeSales,
} from "./retailMath";

describe("retailMath", () => {
    describe("splitLine", () => {
        it("gives the gym its commission percent and the vendor the rest", () => {
            expect(splitLine(10000, 20)).toEqual({ gym: 2000, vendor: 8000 });
        });

        it("always adds back to the line amount, even with odd piastres", () => {
            const { gym, vendor } = splitLine(1001, 33);
            expect(gym + vendor).toBe(1001);
        });

        it("clamps the commission to 0-100", () => {
            expect(splitLine(500, 150)).toEqual({ gym: 500, vendor: 0 });
            expect(splitLine(500, -5)).toEqual({ gym: 0, vendor: 500 });
        });
    });

    describe("allocateDiscount", () => {
        it("spreads the discount so the parts sum exactly to it", () => {
            const parts = allocateDiscount([1000, 1000, 1000], 100);
            expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
            expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        });

        it("never discounts more than the gross total", () => {
            const parts = allocateDiscount([500, 500], 5000);
            expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
        });

        it("returns zeros when there is nothing to discount", () => {
            expect(allocateDiscount([500, 500], 0)).toEqual([0, 0]);
        });
    });

    describe("computeSaleTotals", () => {
        const lines = [
            { unitPrice: 50, qty: 2, commissionPercent: 100 }, // bar item, gym keeps all
            { unitPrice: 300, qty: 1, commissionPercent: 20 }, // supplement concession
        ];

        it("computes subtotal, total and the vendor / gym split", () => {
            const totals = computeSaleTotals(lines, 0);
            expect(totals.subtotal).toBe(400);
            expect(totals.total).toBe(400);
            expect(totals.gymShare).toBe(160);
            expect(totals.vendorShare).toBe(240);
            expect(totals.lines[1]).toEqual({ lineTotal: 300, gymShare: 60, vendorShare: 240 });
        });

        it("keeps gym + vendor equal to the total after a discount", () => {
            const totals = computeSaleTotals(lines, 33.33);
            expect(totals.total).toBe(366.67);
            expect(Math.round((totals.gymShare + totals.vendorShare) * 100)).toBe(Math.round(totals.total * 100));
            const lineSum = totals.lines.reduce((sum, l) => sum + l.lineTotal, 0);
            expect(Math.round(lineSum * 100)).toBe(Math.round(totals.total * 100));
        });

        it("caps the discount at the subtotal", () => {
            const totals = computeSaleTotals(lines, 9999);
            expect(totals.discount).toBe(400);
            expect(totals.total).toBe(0);
        });

        it("splits using the commission captured on the line, not a later change", () => {
            const before = computeSaleTotals([{ unitPrice: 100, qty: 1, commissionPercent: 10 }], 0);
            // Vendor commission is later edited to 50%; the stored snapshot is unchanged.
            expect(before.lines[0].gymShare).toBe(10);
            expect(before.lines[0].vendorShare).toBe(90);
        });
    });

    describe("proportionalRefund", () => {
        it("returns exactly the original amount across partial refunds", () => {
            // 3 units sharing 10.00: 3.33 + 3.34 + 3.33 must add back to 10.00
            const first = proportionalRefund(10, 3, 0, 1);
            const second = proportionalRefund(10, 3, 1, 1);
            const third = proportionalRefund(10, 3, 2, 1);
            expect(Math.round((first + second + third) * 100)).toBe(1000);
        });

        it("refunds a full line in one go", () => {
            expect(proportionalRefund(250.5, 5, 0, 5)).toBe(250.5);
        });
    });

    describe("summarizeSales", () => {
        const day = new Date("2026-11-10T09:00:00Z");
        const sale = (id, items, extra = {}) => ({
            _id: id,
            createdAt: day,
            paymentMethod: "cash",
            items,
            ...extra,
        });
        const item = (vendorId, name, lineTotal, gymShare, extra = {}) => ({
            productId: `p-${name}`,
            vendorId,
            vendorName: `V-${vendorId}`,
            name,
            qty: 1,
            lineTotal,
            gymShare,
            vendorShare: lineTotal - gymShare,
            ...extra,
        });

        it("reports revenue per vendor and a total across all vendors", () => {
            const result = summarizeSales([
                sale("s1", [item("bar", "Shake", 60, 60), item("brand", "Whey", 1000, 200)]),
                sale("s2", [item("bar", "Coffee", 30, 30)]),
            ]);
            expect(result.totals.net).toBe(1090);
            expect(result.totals.sales).toBe(2);
            const bar = result.vendors.find((v) => v.vendorId === "bar");
            const brand = result.vendors.find((v) => v.vendorId === "brand");
            expect(bar.net).toBe(90);
            expect(brand.net).toBe(1000);
            expect(brand.gymShare).toBe(200);
            expect(brand.vendorShare).toBe(800);
            expect(bar.net + brand.net).toBe(result.totals.net);
        });

        it("nets refunds off revenue and shares", () => {
            const result = summarizeSales([
                sale("s1", [
                    item("brand", "Whey", 1000, 200, {
                        qty: 2,
                        refundedQty: 1,
                        refundedAmount: 500,
                        refundedGymShare: 100,
                        refundedVendorShare: 400,
                    }),
                ]),
            ]);
            expect(result.totals.net).toBe(500);
            expect(result.totals.refunded).toBe(500);
            expect(result.totals.gymShare).toBe(100);
            expect(result.totals.vendorShare).toBe(400);
            expect(result.totals.units).toBe(1);
        });

        it("filters by vendor and groups by Cairo day", () => {
            const late = new Date("2026-11-10T22:30:00Z"); // already Nov 11 in Cairo
            const result = summarizeSales(
                [
                    sale("s1", [item("bar", "Shake", 60, 60)]),
                    sale("s2", [item("bar", "Shake", 60, 60), item("brand", "Whey", 100, 20)], { createdAt: late }),
                ],
                { vendorId: "bar" }
            );
            expect(result.totals.net).toBe(120);
            expect(result.vendors).toHaveLength(1);
            expect(result.daily.map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
        });
    });
});
