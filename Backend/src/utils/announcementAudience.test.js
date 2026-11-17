import { describe, it, expect } from "vitest";
import {
    buildActiveAnnouncementQuery,
    matchesAudience,
    filterForUser,
    sanitizeTargetRoles,
    pruneDismissedIds,
} from "./announcementAudience";

describe("announcementAudience", () => {
    const tenantId = "507f1f77bcf86cd799439011";
    const otherTenant = "507f1f77bcf86cd799439099";

    describe("buildActiveAnnouncementQuery", () => {
        it("requires active status and a start/end window around now", () => {
            const now = new Date("2026-06-01T12:00:00.000Z");
            expect(buildActiveAnnouncementQuery(now)).toEqual({
                isActive: true,
                startDate: { $lte: now },
                $or: [{ endDate: null }, { endDate: { $gt: now } }],
            });
        });
    });

    describe("matchesAudience", () => {
        it("matches all-target announcements for any plan/role", () => {
            const ann = { target: { type: "all", targetRoles: [] } };
            expect(matchesAudience(ann, { planKey: "basic", tenantId, role: "Coach" })).toBe(true);
        });

        it("matches plan targeting by plan key", () => {
            const ann = { target: { type: "plan", targetPlanKeys: ["gold", "platinum"] } };
            expect(matchesAudience(ann, { planKey: "gold", tenantId, role: "Owner" })).toBe(true);
            expect(matchesAudience(ann, { planKey: "basic", tenantId, role: "Owner" })).toBe(false);
        });

        it("matches tenant targeting by tenant id", () => {
            const ann = {
                target: {
                    type: "tenant",
                    targetTenantIds: [tenantId],
                },
            };
            expect(matchesAudience(ann, { planKey: "basic", tenantId, role: "Owner" })).toBe(true);
            expect(matchesAudience(ann, { planKey: "basic", tenantId: otherTenant, role: "Owner" })).toBe(false);
        });

        it("ANDs role targeting with plan/tenant", () => {
            const ann = {
                target: {
                    type: "plan",
                    targetPlanKeys: ["gold"],
                    targetRoles: ["Owner", "General Manager"],
                },
            };
            expect(matchesAudience(ann, { planKey: "gold", tenantId, role: "Owner" })).toBe(true);
            expect(matchesAudience(ann, { planKey: "gold", tenantId, role: "Coach" })).toBe(false);
            expect(matchesAudience(ann, { planKey: "basic", tenantId, role: "Owner" })).toBe(false);
        });

        it("treats empty targetRoles as all roles", () => {
            const ann = { target: { type: "all", targetRoles: [] } };
            expect(matchesAudience(ann, { planKey: "basic", tenantId, role: "Receptionist" })).toBe(true);
        });
    });

    describe("filterForUser", () => {
        it("filters a list down to matching audience only", () => {
            const list = [
                { _id: "1", target: { type: "all" } },
                { _id: "2", target: { type: "plan", targetPlanKeys: ["platinum"] } },
                { _id: "3", target: { type: "all", targetRoles: ["Sales"] } },
            ];
            const filtered = filterForUser(list, { planKey: "gold", tenantId, role: "Owner" });
            expect(filtered.map((row) => row._id)).toEqual(["1"]);
        });
    });

    describe("sanitizeTargetRoles", () => {
        it("keeps only known gym roles and dedupes", () => {
            expect(sanitizeTargetRoles(["Owner", "Owner", "Hacker", "Coach"])).toEqual([
                "Owner",
                "Coach",
            ]);
        });
    });

    describe("pruneDismissedIds", () => {
        it("dedupes and caps the list length", () => {
            const ids = Array.from({ length: 105 }, (_, i) => `id-${i}`);
            const pruned = pruneDismissedIds(ids, 100);
            expect(pruned).toHaveLength(100);
            expect(pruned[0]).toBe("id-5");
            expect(pruned[99]).toBe("id-104");
        });
    });
});
