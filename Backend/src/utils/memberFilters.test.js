import { describe, it, expect, vi } from "vitest";
const {
    buildMemberListFilter,
    statsFilterFromListFilter,
    getMemberStatusStats,
    numericId,
    buildDateRange,
    isPhoneLikeQuery,
    phoneSearchVariants,
} = require("./memberFilters");
const { cairoDayBounds } = require("./revenueUtils");

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

    it("treats spaced and +20 phone queries as the same number", () => {
        expect(isPhoneLikeQuery("+20 122 900 4551")).toBe(true);
        expect(isPhoneLikeQuery("Ahmed")).toBe(false);
        expect(phoneSearchVariants("+20 122 900 4551")).toEqual(expect.arrayContaining([
            "201229004551",
            "01229004551",
            "1229004551",
        ]));
        expect(phoneSearchVariants("+201229004551")).toEqual(expect.arrayContaining([
            "201229004551",
            "01229004551",
        ]));

        const filter = buildMemberListFilter({ search: "+20 122 900 4551" });
        const phoneClauses = filter.$or.filter((clause) => clause.phones || clause.phoneKey);
        const serialized = JSON.stringify(phoneClauses);
        expect(serialized).toMatch(/01229004551/);
        expect(serialized).toMatch(/201229004551/);
        expect(filter.$or.some((clause) => clause.phoneKey === "201229004551")).toBe(true);
    });

    it("does not expand name searches into phone variants", () => {
        const filter = buildMemberListFilter({ search: "Ahmed" });
        expect(filter.$or).toEqual([
            { name: { $regex: "Ahmed", $options: "i" } },
            { phones: { $regex: "Ahmed", $options: "i" } },
        ]);
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
        expect(stats.$expr).toBeUndefined();
        expect(stats.$and?.some((c) => c.$expr)).toBeFalsy();
    });

    it("builds expiringSoon filter against the last subscription end date", () => {
        const filter = buildMemberListFilter({
            expiringSoon: "true",
        });
        expect(filter.status).toBe("active");
        expect(filter.$and).toEqual(expect.arrayContaining([
            { "subscriptions.0": { $exists: true } },
            expect.objectContaining({ $expr: expect.any(Object) }),
        ]));
        expect(filter.subscriptions).toBeUndefined();
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
        const { start, end } = cairoDayBounds("2026-05-01", "2026-05-31");
        const periodFilter = buildMemberListFilter({
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
            transferType: "bulk",
            assignedSales: "507f1f77bcf86cd799439011",
            currentCouch: "507f1f77bcf86cd799439012",
        });

        expect(periodFilter.userlog).toEqual({ $elemMatch: { type: "assign", text: /bulk/i } });
        expect(periodFilter.assignedSales).toBe("507f1f77bcf86cd799439011");
        expect(periodFilter.current_couch).toBe("507f1f77bcf86cd799439012");
        expect(periodFilter.$and).toEqual(expect.arrayContaining([
            expect.objectContaining({
                subscriptions: {
                    $elemMatch: {
                        endDate: { $gte: start, $lte: end },
                    },
                },
            }),
        ]));

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
        const { start } = cairoDayBounds("2026-05-01", "2026-05-31");
        const filter = buildMemberListFilter({
            transferType: "bulk",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "transferDate",
        });
        expect(filter.userlog.$elemMatch.type).toBe("assign");
        expect(filter.userlog.$elemMatch.text).toEqual(/bulk/i);
        expect(filter.userlog.$elemMatch.createdAt.$gte).toEqual(start);
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
                    $gte: expect.any(Date),
                    $lte: expect.any(Date),
                }),
            }),
        ]));
    });

    it("ANDs expiringSoon with end-date period filters", () => {
        const { start, end } = cairoDayBounds("2026-05-01", "2026-05-31");
        const filter = buildMemberListFilter({
            expiringSoon: "true",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
        });
        expect(filter.status).toBe("active");
        expect(filter.$and).toEqual(expect.arrayContaining([
            expect.objectContaining({ $expr: expect.any(Object) }),
            expect.objectContaining({
                subscriptions: {
                    $elemMatch: {
                        endDate: { $gte: start, $lte: end },
                    },
                },
            }),
        ]));
    });

    it("combines guest-report style filters (status, sales, coach, dates, source)", () => {
        const { start } = cairoDayBounds("2026-05-01", "2026-05-31");
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
        expect(filter.createdAt.$gte).toEqual(start);
        expect(filter.source).toBe("Walk in");
    });

    it("matches package + endDate on the SAME subscription via $elemMatch", () => {
        const packageId = "507f1f77bcf86cd799439099";
        const { start, end } = cairoDayBounds("2026-05-01", "2026-05-31");
        const filter = buildMemberListFilter({
            status: "expired",
            packageId,
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
            assignedSales: "507f1f77bcf86cd799439011",
            currentCouch: "507f1f77bcf86cd799439012",
            gender: "male",
            activityType: "gym",
        });

        expect(filter["subscriptions.package"]).toBeUndefined();
        expect(filter["subscriptions.endDate"]).toBeUndefined();
        expect(filter.gender).toBe("male");

        const elemClause = (filter.$and || []).find((c) => c.subscriptions?.$elemMatch);
        expect(elemClause).toBeDefined();
        expect(elemClause.subscriptions.$elemMatch.package).toBe(packageId);
        expect(elemClause.subscriptions.$elemMatch.endDate).toEqual({ $gte: start, $lte: end });
        // gym allows missing snapshot type (legacy default)
        expect(elemClause.subscriptions.$elemMatch.$or).toEqual(expect.arrayContaining([
            { "packageSnapshot.activityType": "gym" },
            { "packageSnapshot.activityType": { $exists: false } },
        ]));

        const mmaFilter = buildMemberListFilter({
            activityType: "mma",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
        });
        const mmaElem = (mmaFilter.$and || []).find((c) => c.subscriptions?.$elemMatch);
        expect(mmaElem.subscriptions.$elemMatch["packageSnapshot.activityType"]).toBe("mma");
    });

    it("treats status All like no status filter", () => {
        const filter = buildMemberListFilter({ status: "All", gender: "female" });
        expect(filter.status).toBeUndefined();
        expect(filter.isBlocked).toBeUndefined();
        expect(filter.gender).toBe("female");
    });

    it("keeps prior $and clauses when search is combined with other filters", () => {
        const filter = buildMemberListFilter({
            packageId: "507f1f77bcf86cd799439099",
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
            dateField: "endDate",
            search: "ahmed",
        });
        expect(filter.$or).toBeUndefined();
        expect(filter.$and).toEqual(expect.arrayContaining([
            expect.objectContaining({
                subscriptions: expect.objectContaining({ $elemMatch: expect.any(Object) }),
            }),
            expect.objectContaining({
                $or: expect.arrayContaining([
                    { name: expect.any(Object) },
                    { phones: expect.any(Object) },
                ]),
            }),
        ]));
    });

    it("uses Cairo day bounds for both ends of a date range", () => {
        const range = buildDateRange("2026-05-01", "2026-05-01");
        const { start, end } = cairoDayBounds("2026-05-01", "2026-05-01");
        expect(range.$gte).toEqual(start);
        expect(range.$lte).toEqual(end);
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
        const nonBlockedStatusCalls = statusCalls.filter(c => c.status);
        expect(nonBlockedStatusCalls.length).toBe(4);
        nonBlockedStatusCalls.forEach(call => {
            expect(call.isBlocked).toEqual({ $ne: true });
        });
        const blockedCall = statusCalls.find(c => c.isBlocked === true);
        expect(blockedCall).toBeDefined();
    });
});
