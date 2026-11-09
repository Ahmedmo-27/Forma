import { describe, it, expect, vi } from "vitest";
const { buildMemberListFilter, statsFilterFromListFilter, getMemberStatusStats, numericId } = require("./memberFilters");

describe("member list filters", () => {
    it("reads an S-prefixed system id as a number and never filters unassigned", () => {
        expect(numericId("S100")).toBe(100);
        expect(numericId("s12")).toBe(12);
        const filter = buildMemberListFilter({ search: "S100", status: "active" });
        expect(filter.status).toBe("active");
        expect(filter.$or).toEqual(expect.arrayContaining([
            { systemId: 100 },
            { memberId: 100 },
        ]));
        expect(filter.assignedSales).toBeUndefined();
        expect(JSON.stringify(filter)).not.toMatch(/unassigned/i);
    });

    it("keeps status cards on the full book when extra filters are on", () => {
        const filter = buildMemberListFilter({
            status: "frozen",
            transferred: "true",
            recent: "true",
            expiringSoon: "true",
            assignedSales: "abc",
        });
        const stats = statsFilterFromListFilter(filter);
        expect(stats.assignedSales).toBe("abc");
        expect(stats.status).toBeUndefined();
        expect(stats.userlog).toBeUndefined();
        expect(stats.createdAt).toBeUndefined();
        expect(stats["subscriptions.endDate"]).toBeUndefined();
    });

    it("counts each status with countDocuments so string ids still match", async () => {
        const calls = [];
        const Member = {
            countDocuments: vi.fn(async (filter) => {
                calls.push(filter);
                if (filter.status === "active") return 4;
                if (filter.status === "frozen") return 1;
                if (filter.status === "expired") return 2;
                if (filter.status === "guest") return 3;
                if (filter.isBlocked) return 1;
                return 10;
            }),
        };
        const stats = await getMemberStatusStats(Member, { assignedSales: "507f1f77bcf86cd799439011" });
        expect(stats).toEqual({ total: 10, active: 4, frozen: 1, expired: 2, guest: 3, blocked: 1 });
        expect(calls.every((filter) => filter.assignedSales === "507f1f77bcf86cd799439011")).toBe(true);
        expect(Member.countDocuments).toHaveBeenCalled();
    });

    it("supports date period from/to and transfer type filtering in member list", () => {
        const periodFilter = buildMemberListFilter({
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
            transferType: "bulk",
            unassignedSales: "true",
            unassignedCoach: "true",
        });

        expect(periodFilter["subscriptions.endDate"].$gte).toEqual(new Date("2026-05-01"));
        expect(periodFilter.userlog).toEqual({ $elemMatch: { type: "assign", text: /bulk/i } });
        expect(periodFilter.assignedSales).toBeNull();
        expect(periodFilter.current_couch).toBeNull();

        const neverFilter = buildMemberListFilter({ transferType: "never" });
        expect(neverFilter["userlog.type"]).toEqual({ $ne: "assign" });
    });
});
