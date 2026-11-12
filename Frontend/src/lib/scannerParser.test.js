import { describe, it, expect } from "vitest";
import { parseScannedIdentifier } from "./scannerParser";

describe("parseScannedIdentifier", () => {
  it("normalizes system ID with S prefix", () => {
    expect(parseScannedIdentifier("S100")).toBe("S100");
    expect(parseScannedIdentifier("s100")).toBe("S100");
    expect(parseScannedIdentifier("s100003")).toBe("S100003");
  });

  it("normalizes member ID with M prefix", () => {
    expect(parseScannedIdentifier("M100")).toBe("M100");
    expect(parseScannedIdentifier("m100")).toBe("M100");
    expect(parseScannedIdentifier("m100003")).toBe("M100003");
  });

  it("keeps bare numbers in auto mode", () => {
    expect(parseScannedIdentifier("100")).toBe("100");
    expect(parseScannedIdentifier("105")).toBe("105");
  });

  it("forces systemId prefix when mode is systemId", () => {
    expect(parseScannedIdentifier("105", "systemId")).toBe("S105");
    expect(parseScannedIdentifier("s105", "systemId")).toBe("S105");
  });

  it("forces memberId prefix when mode is memberId", () => {
    expect(parseScannedIdentifier("105", "memberId")).toBe("M105");
    expect(parseScannedIdentifier("m105", "memberId")).toBe("M105");
  });

  it("handles barcodes", () => {
    expect(parseScannedIdentifier("ff000105")).toBe("FF000105");
    expect(parseScannedIdentifier("FF000105")).toBe("FF000105");
  });

  it("extracts systemId or memberId from JSON payloads", () => {
    expect(parseScannedIdentifier(JSON.stringify({ systemId: 105 }))).toBe("S105");
    expect(parseScannedIdentifier(JSON.stringify({ memberId: 200 }))).toBe("M200");
    expect(parseScannedIdentifier(JSON.stringify({ id: "S105" }))).toBe("S105");
    expect(parseScannedIdentifier(JSON.stringify({ barcode: "FF000105" }))).toBe("FF000105");
  });

  it("extracts identifier from URLs", () => {
    expect(parseScannedIdentifier("https://gym.forma.app/members/S105")).toBe("S105");
    expect(parseScannedIdentifier("https://gym.forma.app/checkin?id=S105")).toBe("S105");
    expect(parseScannedIdentifier("https://gym.forma.app/checkin?systemId=105")).toBe("S105");
    expect(parseScannedIdentifier("https://gym.forma.app/checkin?memberId=200")).toBe("M200");
  });

  it("extracts labeled text formats", () => {
    expect(parseScannedIdentifier("systemId: 105")).toBe("S105");
    expect(parseScannedIdentifier("system: 105")).toBe("S105");
    expect(parseScannedIdentifier("memberId: 200")).toBe("M200");
    expect(parseScannedIdentifier("member: 200")).toBe("M200");
  });

  it("handles null, undefined, empty", () => {
    expect(parseScannedIdentifier(null)).toBe("");
    expect(parseScannedIdentifier(undefined)).toBe("");
    expect(parseScannedIdentifier("   ")).toBe("");
  });
});
