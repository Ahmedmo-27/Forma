import { describe, it, expect } from "vitest";
import { formatSystemId, formatMemberId, memberQrPayload } from "./systemId";

describe("systemId utilities", () => {
  describe("formatSystemId", () => {
    it("formats numeric systemId with S prefix", () => {
      expect(formatSystemId(100)).toBe("S100");
      expect(formatSystemId("100")).toBe("S100");
      expect(formatSystemId("s100")).toBe("S100");
      expect(formatSystemId("S100")).toBe("S100");
    });

    it("handles empty or nil values", () => {
      expect(formatSystemId(null)).toBe("");
      expect(formatSystemId(undefined)).toBe("");
      expect(formatSystemId("")).toBe("");
    });
  });

  describe("formatMemberId", () => {
    it("returns memberId as pure numeric string without M prefix", () => {
      expect(formatMemberId(100)).toBe("100");
      expect(formatMemberId("100")).toBe("100");
      expect(formatMemberId("m100")).toBe("100");
      expect(formatMemberId("M100")).toBe("100");
    });

    it("handles empty or nil values", () => {
      expect(formatMemberId(null)).toBe("");
      expect(formatMemberId(undefined)).toBe("");
      expect(formatMemberId("")).toBe("");
    });
  });

  describe("memberQrPayload", () => {
    it("returns numeric memberId without M prefix for active members", () => {
      const member = {
        name: "Jane Doe",
        isMember: true,
        memberId: 105,
        systemId: 200,
      };
      expect(memberQrPayload(member)).toBe("105");
    });

    it("returns numeric memberId without M prefix when memberId is present", () => {
      const member = {
        name: "Jane Doe",
        memberId: 105,
        systemId: 200,
      };
      expect(memberQrPayload(member)).toBe("105");
    });

    it("returns systemId formatted with S prefix for people who aren't members yet (guests)", () => {
      const guest = {
        name: "John Prospect",
        isMember: false,
        status: "guest",
        systemId: 200,
      };
      expect(memberQrPayload(guest)).toBe("S200");
    });

    it("falls back to systemId if isMember is true but memberId is missing", () => {
      const memberWithoutId = {
        name: "Lead",
        isMember: true,
        systemId: 300,
      };
      expect(memberQrPayload(memberWithoutId)).toBe("S300");
    });

    it("accepts direct primitive systemId and memberId strings or numbers", () => {
      expect(memberQrPayload("S100")).toBe("S100");
      expect(memberQrPayload("M105")).toBe("105");
      expect(memberQrPayload(105)).toBe("105");
    });
  });
});
