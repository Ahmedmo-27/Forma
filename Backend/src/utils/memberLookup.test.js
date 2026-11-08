import { describe, it, expect } from "vitest";
const { buildMemberFilter } = require("./memberLookup");

describe("buildMemberFilter", () => {
    it("matches a QR system id to that system id only", () => {
        expect(buildMemberFilter("S100")).toEqual({ systemId: 100 });
        expect(buildMemberFilter("s100003")).toEqual({ systemId: 100003 });
    });

    it("matches a printed barcode to the barcode field", () => {
        expect(buildMemberFilter("FF000105")).toEqual({ barcode: "FF000105" });
    });

    it("still accepts a bare number as either id", () => {
        expect(buildMemberFilter("100")).toEqual({
            $or: [{ systemId: 100 }, { memberId: 100 }],
        });
    });
});
