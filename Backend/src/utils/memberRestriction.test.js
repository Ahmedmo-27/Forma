import { describe, it, expect } from "vitest";
import {
    checkInDeniedMessage,
    clearRestrictionFields,
    suspensionExpired,
} from "./memberRestriction.js";

describe("memberRestriction", () => {
    it("returns suspend-specific check-in message", () => {
        const member = { isBlocked: true, restrictionType: "suspend", suspendedUntil: new Date("2099-01-01") };
        expect(checkInDeniedMessage(member)).toBe("Cannot check in — member is suspended");
    });

    it("returns blocked message for lock", () => {
        expect(checkInDeniedMessage({ isBlocked: true, restrictionType: "lock" })).toBe(
            "Cannot check in — member is blocked"
        );
    });

    it("detects expired suspension", () => {
        const member = {
            isBlocked: true,
            restrictionType: "suspend",
            suspendedUntil: new Date("2020-01-01"),
        };
        expect(suspensionExpired(member, new Date("2025-01-01"))).toBe(true);
        clearRestrictionFields(member);
        expect(member.isBlocked).toBe(false);
        expect(member.restrictionType).toBeNull();
    });
});