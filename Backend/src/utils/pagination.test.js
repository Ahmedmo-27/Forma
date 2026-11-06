import { describe, it, expect } from "vitest";
const { parsePagination, buildPagination } = require("./pagination");

describe("pagination utils", () => {
    describe("parsePagination", () => {
        it("returns defaults when query is empty or undefined", () => {
            const result = parsePagination({});
            expect(result).toEqual({ page: 1, limit: 20, skip: 0, all: false });

            const resultUndef = parsePagination(undefined);
            expect(resultUndef).toEqual({ page: 1, limit: 20, skip: 0, all: false });
        });

        it("parses valid page and limit numbers correctly", () => {
            const result = parsePagination({ page: "3", limit: "15" });
            expect(result).toEqual({ page: 3, limit: 15, skip: 30, all: false });
        });

        it("enforces minimum bounds on negative page and limit", () => {
            const result = parsePagination({ page: "-5", limit: "-2" });
            expect(result.page).toBe(1);
            expect(result.limit).toBe(1);
            expect(result.skip).toBe(0);
        });

        it("enforces maxLimit cap", () => {
            const result = parsePagination({ page: "1", limit: "500" }, { maxLimit: 50 });
            expect(result.limit).toBe(50);
        });

        it("handles all=true by returning allLimit and all=true flag", () => {
            const result = parsePagination({ all: "true" }, { allLimit: 1000 });
            expect(result).toEqual({ page: 1, limit: 1000, skip: 0, all: true });
        });
    });

    describe("buildPagination", () => {
        it("calculates totalPages and navigation flags correctly", () => {
            const result = buildPagination(1, 20, 45);
            expect(result).toEqual({
                page: 1,
                limit: 20,
                total: 45,
                totalPages: 3,
                hasNextPage: true,
                hasPrevPage: false,
            });
        });

        it("handles last page navigation flags", () => {
            const result = buildPagination(3, 20, 45);
            expect(result.hasNextPage).toBe(false);
            expect(result.hasPrevPage).toBe(true);
        });

        it("handles zero total records gracefully", () => {
            const result = buildPagination(1, 20, 0);
            expect(result).toEqual({
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 1,
                hasNextPage: false,
                hasPrevPage: false,
            });
        });
    });
});
