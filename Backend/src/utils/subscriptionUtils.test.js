const {
    findActiveSubscription,
    validateNoOverlappingSubscription,
    resolveNextPackageStart,
    closeRefundedSubscription,
} = require("./subscriptionUtils");

describe("subscriptionUtils", () => {
    const now = new Date("2026-07-13T12:00:00Z");

    it("finds an active subscription", () => {
        const subs = [{
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
        }];
        expect(findActiveSubscription(subs, now)).toBeTruthy();
    });

    it("rejects a package starting before active subscription ends", () => {
        const subs = [{
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
        }];
        const message = validateNoOverlappingSubscription(
            subs,
            new Date("2026-07-14"),
            now
        );
        expect(message).toMatch(/active subscription/i);
    });

    it("allows a package starting on the active subscription end date", () => {
        const subs = [{
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
        }];
        const message = validateNoOverlappingSubscription(
            subs,
            new Date("2026-08-01"),
            now
        );
        expect(message).toBeNull();
    });

    it("starts an upgrade today and leaves the open package unchanged", () => {
        const open = {
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
            pricePaid: 1500,
        };
        const result = resolveNextPackageStart({
            subscriptions: [open],
            upgrade: true,
            now,
        });

        expect(result.error).toBeNull();
        expect(result.start).toEqual(now);
        expect(open.endDate).toEqual(new Date("2026-08-01"));
        expect(open.pricePaid).toBe(1500);
    });

    it("lets the next package start today when the refund is only an amount", () => {
        const refunded = {
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
            pricePaid: 1500,
            refundAmount: 200,
        };
        const result = resolveNextPackageStart({
            subscriptions: [refunded],
            startDate: "2026-07-13",
            now,
        });

        expect(result.error).toBeNull();
        expect(validateNoOverlappingSubscription([refunded], new Date("2026-07-13"), now)).toBeNull();
    });

    it("still blocks on an earlier package that was not refunded", () => {
        const open = {
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
            pricePaid: 1000,
        };
        const refunded = {
            startDate: new Date("2026-07-01"),
            endDate: new Date("2026-09-01"),
            pricePaid: 1500,
            refunded: true,
            refundAmount: 1500,
        };
        const result = resolveNextPackageStart({
            subscriptions: [open, refunded],
            startDate: "2026-07-13",
            now,
        });

        expect(result.error).toMatch(/2026-08-01/);
    });

    it("lets the next package start today when the last package was refunded", () => {
        const refunded = {
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
            pricePaid: 1500,
            refunded: true,
            cancelled: true,
            subscriptionStatus: "cancelled",
        };
        const result = resolveNextPackageStart({
            subscriptions: [refunded],
            startDate: "2026-07-13",
            now,
        });

        expect(result.error).toBeNull();
        expect(result.start).toEqual(new Date("2026-07-13"));
    });

    it("closes a refunded package end date that is still in the future", () => {
        const subscription = {
            endDate: new Date("2026-08-01"),
            pricePaid: 1500,
            refundAmount: 1500,
        };

        closeRefundedSubscription(subscription, now);

        expect(subscription.endDate).toEqual(now);
        expect(subscription.pricePaid).toBe(1500);
        expect(subscription.refundAmount).toBe(1500);
    });
});
