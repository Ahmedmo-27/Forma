import { describe, expect, it } from "vitest";
import { ACTIVITY_GAP_MS, claimActivityTouch } from "./authMiddleware";

describe("gym activity touch", () => {
    it("records a gym at most once every 15 minutes", () => {
        const touches = new Map();
        const start = Date.parse("2026-06-15T10:00:00.000Z");

        expect(claimActivityTouch(touches, "gym-a", start)).toBe(true);
        expect(claimActivityTouch(touches, "gym-a", start + ACTIVITY_GAP_MS - 1)).toBe(false);
        expect(claimActivityTouch(touches, "gym-b", start + 1000)).toBe(true);
        expect(claimActivityTouch(touches, "gym-a", start + ACTIVITY_GAP_MS)).toBe(true);
        expect(claimActivityTouch(touches, "", start)).toBe(false);
    });
});
