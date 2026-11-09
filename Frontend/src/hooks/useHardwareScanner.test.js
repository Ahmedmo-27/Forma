import { describe, it, expect, vi } from "vitest";
import useHardwareScanner from "./useHardwareScanner";

describe("useHardwareScanner hook", () => {
  it("exports a valid hook function", () => {
    expect(typeof useHardwareScanner).toBe("function");
  });
});
