import { describe, it, expect } from "vitest";
import { toLocalDateString, parseDateBoundary } from "./ui";

describe("ui date and filter helpers", () => {
  it("formats Date objects and strings to YYYY-MM-DD locally without timezone shift", () => {
    const d = new Date(2026, 4, 15); // May 15, 2026 local
    expect(toLocalDateString(d)).toBe("2026-05-15");

    const janFirst = new Date(2026, 0, 1);
    expect(toLocalDateString(janFirst)).toBe("2026-01-01");

    expect(toLocalDateString("invalid")).toBe("");
  });

  it("parses date boundaries correctly for start and end of day", () => {
    const start = parseDateBoundary("2026-05-10", false);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4);
    expect(start.getDate()).toBe(10);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);

    const end = parseDateBoundary("2026-05-10", true);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(4);
    expect(end.getDate()).toBe(10);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);

    expect(parseDateBoundary(null)).toBeNull();
    expect(parseDateBoundary("")).toBeNull();
  });
});
