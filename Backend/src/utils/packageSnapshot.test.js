const { buildPackageSnapshot, resolveSubscriptionPackage } = require("./packageSnapshot");

describe("packageSnapshot", () => {
    const catalogPkg = {
        _id: "pkg-1",
        name: "Gym 3M",
        activityType: "gym",
        duration: "3 months",
        price: 3000,
        freezeLimitDays: 10,
        invitationLimit: 2,
        renewalDiscountPercent: 15,
        description: "Standard",
        hasException: false,
        free_pt_sessions: 1,
    };

    it("builds a snapshot of purchase-time package terms", () => {
        const snap = buildPackageSnapshot(catalogPkg);
        expect(snap).toEqual({
            name: "Gym 3M",
            activityType: "gym",
            duration: "3 months",
            price: 3000,
            freezeLimitDays: 10,
            invitationLimit: 2,
            renewalDiscountPercent: 15,
            description: "Standard",
            hasException: false,
            free_pt_sessions: 1,
            locationScope: "all",
            eligibleLocationIds: [],
        });
        expect(snap).not.toHaveProperty("_id");
    });

    it("keeps payment-record package terms when the catalog package is later edited", () => {
        const pricePaid = 3000;
        const subscription = {
            package: { ...catalogPkg, price: 9999, freezeLimitDays: 99, name: "Renamed" },
            packageSnapshot: buildPackageSnapshot(catalogPkg),
            pricePaid,
        };

        const resolved = resolveSubscriptionPackage(subscription);

        expect(subscription.pricePaid).toBe(3000);
        expect(resolved.price).toBe(3000);
        expect(resolved.freezeLimitDays).toBe(10);
        expect(resolved.name).toBe("Gym 3M");
        expect(resolved._id).toBe("pkg-1");
    });

    it("falls back to live package for legacy subscriptions without a snapshot", () => {
        const subscription = {
            package: catalogPkg,
            pricePaid: 3000,
        };
        const resolved = resolveSubscriptionPackage(subscription);
        expect(resolved.name).toBe("Gym 3M");
        expect(resolved.price).toBe(3000);
    });

    it("returns null when neither snapshot nor live package exists", () => {
        expect(resolveSubscriptionPackage({})).toBeNull();
        expect(resolveSubscriptionPackage(null)).toBeNull();
    });

    it("uses snapshot alone when package ref is an unpopulated ObjectId-like value", () => {
        const fakeObjectId = { _bsontype: "ObjectId", toString: () => "pkg-1" };
        const subscription = {
            package: fakeObjectId,
            packageSnapshot: buildPackageSnapshot(catalogPkg),
            pricePaid: 3000,
        };
        const resolved = resolveSubscriptionPackage(subscription);
        expect(resolved.name).toBe("Gym 3M");
        expect(resolved.price).toBe(3000);
        expect(resolved._id).toBe(fakeObjectId);
    });
});
