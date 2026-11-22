const {
    isStaffRestricted,
    isTimedSuspension,
    suspensionExpired,
    clearRestrictionFields,
    maybeClearExpiredSuspension,
    loginDeniedPayload,
    staffRestrictionDenied,
} = require("./staffRestriction");

describe("staffRestriction", () => {
    it("detects lock vs suspend", () => {
        expect(isStaffRestricted({ isBlocked: true, restrictionType: "lock" })).toBe(true);
        expect(isTimedSuspension({ restrictionType: "suspend" })).toBe(true);
        expect(isTimedSuspension({ restrictionType: "lock" })).toBe(false);
    });

    it("returns lock login payload", () => {
        const payload = loginDeniedPayload({ isBlocked: true, restrictionType: "lock" });
        expect(payload.code).toBe("STAFF_LOCKED");
        expect(payload.status).toBe(403);
    });

    it("returns suspend login payload with date", () => {
        const payload = loginDeniedPayload({
            isBlocked: true,
            restrictionType: "suspend",
            suspendedUntil: new Date("2099-06-15"),
        });
        expect(payload.code).toBe("STAFF_SUSPENDED");
        expect(payload.message).toContain("2099-06-15");
    });

    it("clears expired suspension", async () => {
        const user = {
            isBlocked: true,
            restrictionType: "suspend",
            suspendedUntil: new Date("2020-01-01"),
            blockedReason: "temp",
            save: async function save() { return this; },
        };
        expect(suspensionExpired(user)).toBe(true);
        await maybeClearExpiredSuspension(user);
        expect(user.isBlocked).toBe(false);
        expect(user.restrictionType).toBeNull();
    });

    it("clearRestrictionFields resets all fields", () => {
        const user = {
            isBlocked: true,
            restrictionType: "lock",
            suspendedUntil: new Date(),
            blockedReason: "x",
            blockedBy: "1",
            blockedAt: new Date(),
        };
        clearRestrictionFields(user);
        expect(user.isBlocked).toBe(false);
        expect(user.restrictionType).toBeNull();
        expect(user.suspendedUntil).toBeNull();
    });

    it("enforces actor rules", () => {
        expect(staffRestrictionDenied("Owner", "a", { _id: "a", role: "Sales" }))
            .toBe("You cannot restrict your own account");
        expect(staffRestrictionDenied("Owner", "a", { _id: "b", role: "Sales" })).toBeNull();
        expect(staffRestrictionDenied("General Manager", "a", { _id: "b", role: "Owner" }))
            .toBe("You cannot restrict this user");
        expect(staffRestrictionDenied("General Manager", "a", { _id: "b", role: "Sales" })).toBeNull();
        expect(staffRestrictionDenied("Sales Manager", "a", { _id: "b", role: "Sales" }))
            .toBe("You cannot restrict this user");
    });
});
