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

    it("maps m-prefixed search to memberId only", () => {
        const filter = buildMemberListFilter({ search: "m42" });
        expect(filter.$or).toEqual(expect.arrayContaining([
            { memberId: 42 },
        ]));
        expect(filter.$or).not.toEqual(expect.arrayContaining([
            { systemId: 42 },
        ]));
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
        expect(stats["subscriptions"]).toBeUndefined();
    });

    it("builds expiringSoon filter using $elemMatch and proper date boundaries without refunded/cancelled", () => {
        const filter = buildMemberListFilter({
            expiringSoon: "true",
        });
        expect(filter.status).toBe("active");
        expect(filter.subscriptions).toBeDefined();
        expect(filter.subscriptions.$elemMatch).toBeDefined();
        expect(filter.subscriptions.$elemMatch.refunded).toEqual({ $ne: true });
        expect(filter.subscriptions.$elemMatch.cancelled).toEqual({ $ne: true });
        expect(filter.subscriptions.$elemMatch.endDate.$gte).toBeInstanceOf(Date);
        expect(filter.subscriptions.$elemMatch.endDate.$lte).toBeInstanceOf(Date);
        expect(filter["subscriptions.endDate"]).toBeUndefined();
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
            assignedSales: "507f1f77bcf86cd799439011",
            currentCouch: "507f1f77bcf86cd799439012",
        });

        expect(periodFilter["subscriptions.endDate"].$gte).toEqual(new Date("2026-05-01"));
        expect(periodFilter.userlog).toEqual({ $elemMatch: { type: "assign", text: /bulk/i } });
        expect(periodFilter.assignedSales).toBe("507f1f77bcf86cd799439011");
        expect(periodFilter.current_couch).toBe("507f1f77bcf86cd799439012");

        const neverFilter = buildMemberListFilter({ transferType: "never" });
        expect(neverFilter["userlog.type"]).toEqual({ $ne: "assign" });
    });

    it("filters blocked members explicitly and excludes blocked from normal statuses", () => {
        const activeFilter = buildMemberListFilter({ status: "active" });
        expect(activeFilter.status).toBe("active");
        expect(activeFilter.isBlocked).toEqual({ $ne: true });

        const blockedFilter = buildMemberListFilter({ status: "blocked" });
        expect(blockedFilter.status).toBeUndefined();
        expect(blockedFilter.isBlocked).toBe(true);

        const allFilter = buildMemberListFilter({ status: "all" });
        expect(allFilter.status).toBeUndefined();
        expect(allFilter.isBlocked).toBeUndefined();
    });

    it("ANDs transfer type with transfer-date period in one userlog $elemMatch", () => {
        const filter = buildMemberListFilter({
            transferType: "bulk",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "transferDate",
        });
        expect(filter.userlog.$elemMatch.type).toBe("assign");
        expect(filter.userlog.$elemMatch.text).toEqual(/bulk/i);
        expect(filter.userlog.$elemMatch.createdAt.$gte).toEqual(new Date("2026-05-01"));
    });

    it("ANDs recent members with an explicit join-date period", () => {
        const filter = buildMemberListFilter({
            recent: "true",
            dateFrom: "2026-01-01",
            dateTo: "2026-06-30",
            dateField: "createdAt",
        });
        expect(filter.createdAt.$gte).toBeInstanceOf(Date);
        expect(filter.$and).toEqual(expect.arrayContaining([
            expect.objectContaining({
                createdAt: expect.objectContaining({
                    $gte: new Date("2026-01-01"),
                    $lte: expect.any(Date),
                }),
            }),
        ]));
    });

    it("ANDs expiringSoon with subscription end-date period filters", () => {
        const filter = buildMemberListFilter({
            expiringSoon: "true",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
        });
        expect(filter.status).toBe("active");
        expect(filter.subscriptions.$elemMatch).toBeDefined();
        expect(filter.$and).toEqual(expect.arrayContaining([
            expect.objectContaining({ "subscriptions.endDate": expect.any(Object) }),
        ]));
    });

    it("combines guest-report style filters (status, sales, coach, dates, source)", () => {
        const filter = buildMemberListFilter({
            status: "guest",
            assignedSales: "507f1f77bcf86cd799439011",
            currentCouch: "507f1f77bcf86cd799439012",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "createdAt",
            source: "Walk in",
        });
        expect(filter.status).toBe("guest");
        expect(filter.assignedSales).toBe("507f1f77bcf86cd799439011");
        expect(filter.current_couch).toBe("507f1f77bcf86cd799439012");
        expect(filter.createdAt.$gte).toEqual(new Date("2026-05-01"));
        expect(filter.source).toBe("Walk in");
    });

    it("passes isBlocked: { $ne: true } in status stats queries", async () => {
        const statusCalls = [];
        const Member = {
            countDocuments: vi.fn(async (filter) => {
                statusCalls.push(filter);
                return 1;
            }),
        };
        await getMemberStatusStats(Member, {});
        // active, frozen, expired, guest calls should include isBlocked: { $ne: true }
        const nonBlockedStatusCalls = statusCalls.filter(c => c.status);
        expect(nonBlockedStatusCalls.length).toBe(4);
        nonBlockedStatusCalls.forEach(call => {
            expect(call.isBlocked).toEqual({ $ne: true });
        });
        const blockedCall = statusCalls.find(c => c.isBlocked === true);
        expect(blockedCall).toBeDefined();
    });
});
