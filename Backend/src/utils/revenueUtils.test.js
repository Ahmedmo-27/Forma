const {
    subscriptionSalePrice,
    aggregateSubscriptionRevenue,
    aggregateRevenueFromLiveCatalogPrice,
    memberPrice,
    dayKey,
    monthKey,
    isSameDay,
    cairoDayBounds,
} = require("./revenueUtils");
const { buildPackageSnapshot } = require("./packageSnapshot");

describe("revenueUtils — payment-record revenue", () => {
    const snap = buildPackageSnapshot({
        name: "Basic",
        activityType: "gym",
        duration: "1 month",
        price: 2000,
        freezeLimitDays: 5,
        invitationLimit: 1,
        renewalDiscountPercent: 0,
        hasException: false,
    });

    it("subscriptionSalePrice prefers pricePaid over snapshot and live catalog", () => {
        expect(
            subscriptionSalePrice({
                pricePaid: 1800,
                packageSnapshot: snap,
                package: { ...snap, price: 9999 },
            })
        ).toBe(1800);
    });

    it("subscriptionSalePrice falls back to packageSnapshot when pricePaid is missing", () => {
        expect(
            subscriptionSalePrice({
                packageSnapshot: snap,
                package: { ...snap, price: 9999 },
            })
        ).toBe(2000);
    });

    it("aggregateSubscriptionRevenue ignores live catalog price changes", () => {
        const members = [
            {
                subscriptions: [
                    { pricePaid: 2000, packageSnapshot: snap, package: { price: 8000 } },
                    { pricePaid: 2500, packageSnapshot: snap, package: { price: 8000 } },
                ],
            },
        ];

        expect(aggregateSubscriptionRevenue(members)).toEqual({
            totalRevenue: 4500,
            salesCount: 2,
        });
        expect(aggregateRevenueFromLiveCatalogPrice(members)).toBe(16000);
    });

    it("memberPrice uses the latest subscription payment record", () => {
        const member = {
            subscriptions: [
                { pricePaid: 1000, package: { price: 5000 } },
                { pricePaid: 1200, package: { price: 5000 } },
            ],
        };
        expect(memberPrice(member)).toBe(1200);
    });

    it("dayKey, monthKey, and isSameDay evaluate in Cairo time regardless of server UTC offset", () => {
        // 22:30 UTC on Nov 9 is 00:30 on Nov 10 in Cairo (UTC+2)
        const earlyMorningCairo = new Date("2026-11-09T22:30:00.000Z");
        const afternoonCairo = new Date("2026-11-10T12:00:00.000Z");

        expect(dayKey(earlyMorningCairo)).toBe("2026-11-10");
        expect(dayKey(afternoonCairo)).toBe("2026-11-10");
        expect(isSameDay(earlyMorningCairo, afternoonCairo)).toBe(true);
        expect(monthKey(earlyMorningCairo)).toBe("2026-11");
    });

    it("cairoDayBounds returns exact Cairo midnight UTC boundaries", () => {
        const { start, end } = cairoDayBounds("2026-11-10", "2026-11-10");
        expect(start.toISOString()).toBe("2026-11-09T22:00:00.000Z");
        expect(end.toISOString()).toBe("2026-11-10T21:59:59.999Z");
    });
});
