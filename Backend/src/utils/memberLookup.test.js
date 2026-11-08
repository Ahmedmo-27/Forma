import { describe, it, expect } from "vitest";
const { buildMemberFilter } = require("./memberLookup");

describe("buildMemberFilter", () => {
    it("matches a QR system id to that system id only", () => {
        expect(buildMemberFilter("S100")).toEqual({ systemId: 100 });
        expect(buildMemberFilter("s100003")).toEqual({ systemId: 100003 });
    });

    it("matches a QR member id to that member id only", () => {
        expect(buildMemberFilter("M100")).toEqual({ memberId: 100 });
        expect(buildMemberFilter("m100003")).toEqual({ memberId: 100003 });
    });

    it("matches a printed barcode to the barcode field", () => {
        expect(buildMemberFilter("FF000105")).toEqual({ barcode: "FF000105" });
    });

    it("accepts a bare number with memberId prioritized over systemId", () => {
        expect(buildMemberFilter("100")).toEqual({
            $or: [{ memberId: 100 }, { systemId: 100 }],
        });
    });
});
