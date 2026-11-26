const {
    findActiveSubscription,
    findActiveSubscriptions,
    currentPackageSubscription,
    validateNoOverlappingSubscription,
    resolveNextPackageStart,
    closeRefundedSubscription,
    isForfeitedCancellation,
    isSessionPackage,
    subscriptionSessionsLeft,
    lazyExpireSubscription,
    isClosedSubscription,
} = require("./subscriptionUtils");

function sub(overrides = {}) {
    return {
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-08-01"),
        packageSnapshot: { activityType: "gym", name: "Gym", duration: "1 month", price: 1000 },
        ...overrides,
    };
}

describe("subscriptionUtils", () => {
    const now = new Date("2026-07-13T12:00:00Z");

    it("finds an active subscription", () => {
        const subs = [sub()];
        expect(findActiveSubscription(subs, now)).toBeTruthy();
    });

    it("rejects a package starting before active subscription ends", () => {
        const subs = [sub()];
        const message = validateNoOverlappingSubscription(
            subs,
            new Date("2026-07-14"),
            now,
            "gym"
        );
        expect(message).toMatch(/active gym subscription/i);
    });

    it("allows a package starting on the active subscription end date", () => {
        const subs = [sub()];
        const message = validateNoOverlappingSubscription(
            subs,
            new Date("2026-08-01"),
            now,
            "gym"
        );
        expect(message).toBeNull();
    });

    it("allows a concurrent package from a different activity category", () => {
        const gym = sub();
        const message = validateNoOverlappingSubscription(
            [gym],
            new Date("2026-07-14"),
            now,
            "crossfit"
        );
        expect(message).toBeNull();
    });

    it("still blocks a concurrent package in the same activity category", () => {
        const gym = sub();
        const message = validateNoOverlappingSubscription(
            [gym],
            new Date("2026-07-14"),
            now,
            "gym"
        );
        expect(message).toMatch(/active gym subscription/i);
    });

    it("lists every currently covering subscription across categories", () => {
        const gym = sub();
        const crossfit = sub({
            packageSnapshot: { activityType: "crossfit", name: "CF", duration: "1 month", price: 800 },
        });
        const active = findActiveSubscriptions([gym, crossfit], now);
        expect(active).toHaveLength(2);
        expect(findActiveSubscription([gym, crossfit], now, "crossfit")).toBe(crossfit);
    });

    it("starts an upgrade today and leaves the open package unchanged", () => {
        const open = sub({ pricePaid: 1500 });
        const result = resolveNextPackageStart({
            subscriptions: [open],
            upgrade: true,
            now,
            activityType: "gym",
        });

        expect(result.error).toBeNull();
        expect(result.start).toEqual(now);
        expect(open.endDate).toEqual(new Date("2026-08-01"));
        expect(open.pricePaid).toBe(1500);
    });

    it("defaults next start from the same category only", () => {
        const gym = sub({ endDate: new Date("2026-08-01"), pricePaid: 1000 });
        const crossfit = sub({
            endDate: new Date("2026-09-01"),
            pricePaid: 800,
            packageSnapshot: { activityType: "crossfit", name: "CF", duration: "1 month", price: 800 },
        });
        const result = resolveNextPackageStart({
            subscriptions: [gym, crossfit],
            now,
            activityType: "gym",
        });

        expect(result.error).toBeNull();
        expect(result.start).toEqual(new Date("2026-08-01"));
    });

    it("lets a different category start today while another category is active", () => {
        const gym = sub({ pricePaid: 1000 });
        const result = resolveNextPackageStart({
            subscriptions: [gym],
            startDate: "2026-07-13",
            now,
            activityType: "crossfit",
        });

        expect(result.error).toBeNull();
        expect(result.start).toEqual(new Date("2026-07-13"));
    });

    it("lets the next package start today when the refund is only an amount", () => {
        const refunded = sub({
            pricePaid: 1500,
            refundAmount: 200,
        });
        const result = resolveNextPackageStart({
            subscriptions: [refunded],
            startDate: "2026-07-13",
            now,
            activityType: "gym",
        });

        expect(result.error).toBeNull();
        expect(validateNoOverlappingSubscription([refunded], new Date("2026-07-13"), now, "gym")).toBeNull();
    });

    it("still blocks on an earlier package that was not refunded", () => {
        const open = sub({ pricePaid: 1000 });
        const refunded = sub({
            startDate: new Date("2026-07-01"),
            endDate: new Date("2026-09-01"),
            pricePaid: 1500,
            refunded: true,
            refundAmount: 1500,
        });
        const result = resolveNextPackageStart({
            subscriptions: [open, refunded],
            startDate: "2026-07-13",
            now,
            activityType: "gym",
        });

        expect(result.error).toMatch(/2026-08-01/);
    });

    it("does not treat a refund as a no-refund cancellation", () => {
        expect(isForfeitedCancellation({
            refunded: true,
            cancelled: true,
            subscriptionStatus: "cancelled",
            refundAmount: 200,
        })).toBe(false);
        expect(isForfeitedCancellation({
            refunded: false,
            refundAmount: 0,
            cancelled: true,
            cancelReason: "Misconduct at the gym",
        })).toBe(true);
    });

    it("lets the next package start today when the last package was cancelled without a refund", () => {
        const cancelled = {
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
            pricePaid: 1500,
            refundAmount: 0,
            cancelled: true,
            subscriptionStatus: "cancelled",
            cancelReason: "Misconduct at the gym",
        };
        const result = resolveNextPackageStart({
            subscriptions: [cancelled],
            startDate: "2026-07-13",
            now,
        });

        expect(result.error).toBeNull();
        expect(findActiveSubscription([cancelled], now)).toBeNull();
        expect(cancelled.pricePaid).toBe(1500);
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

    it("keeps an earlier covering package when a later row was refunded", () => {
        const open = {
            startDate: new Date("2026-06-01"),
            endDate: new Date("2026-08-01"),
            pricePaid: 1000,
        };
        const refunded = {
            startDate: new Date("2026-07-01"),
            endDate: new Date("2026-09-01"),
            pricePaid: 1500,
            refundAmount: 200,
        };

        expect(findActiveSubscription([open, refunded], now)).toBe(open);
        expect(currentPackageSubscription([open, refunded], now)).toBe(open);
    });

    it("falls back to the latest open package when nothing covers today", () => {
        const open = {
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-02-01"),
            pricePaid: 1000,
        };
        const refunded = {
            startDate: new Date("2026-03-01"),
            endDate: new Date("2026-04-01"),
            refunded: true,
            refundAmount: 800,
        };

        expect(findActiveSubscription([open, refunded], now)).toBeNull();
        expect(currentPackageSubscription([open, refunded], now)).toBe(open);
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

    it("treats completed session packages as closed and inactive", () => {
        const completed = sub({
            packageSnapshot: {
                activityType: "gym",
                name: "10 Pack",
                duration: "1 month",
                price: 500,
                accessType: "sessions",
                sessionLimit: 10,
            },
            sessionsUsed: 10,
            subscriptionStatus: "completed",
        });
        expect(isClosedSubscription(completed)).toBe(true);
        expect(findActiveSubscription([completed], now)).toBeNull();
        expect(isSessionPackage(completed)).toBe(true);
        expect(subscriptionSessionsLeft(completed)).toBe(0);
    });

    it("keeps a session package active while sessions remain inside the window", () => {
        const open = sub({
            packageSnapshot: {
                activityType: "gym",
                name: "10 Pack",
                duration: "1 month",
                price: 500,
                accessType: "sessions",
                sessionLimit: 10,
            },
            sessionsUsed: 6,
            subscriptionStatus: "active",
        });
        expect(findActiveSubscription([open], now)).toBe(open);
        expect(subscriptionSessionsLeft(open)).toBe(4);
    });

    it("excludes a session package with no sessions left even if still marked active", () => {
        const exhausted = sub({
            packageSnapshot: {
                activityType: "gym",
                name: "10 Pack",
                duration: "1 month",
                price: 500,
                accessType: "sessions",
                sessionLimit: 10,
            },
            sessionsUsed: 10,
            subscriptionStatus: "active",
        });
        expect(findActiveSubscription([exhausted], now)).toBeNull();
    });

    it("lazily marks a past-window subscription as expired", () => {
        const past = sub({
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-02-01"),
            subscriptionStatus: "active",
            packageSnapshot: {
                activityType: "gym",
                name: "10 Pack",
                duration: "1 month",
                price: 500,
                accessType: "sessions",
                sessionLimit: 10,
            },
            sessionsUsed: 2,
        });
        expect(lazyExpireSubscription(past, now)).toBe(true);
        expect(past.subscriptionStatus).toBe("expired");
        expect(findActiveSubscription([past], now)).toBeNull();
    });
});
