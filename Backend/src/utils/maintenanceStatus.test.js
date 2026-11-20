import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { MS, intervalMs, addInterval, computeStatus } = require("./maintenanceStatus");

const NOW = new Date("2026-03-10T12:00:00.000Z");
const ago = (ms) => new Date(NOW.getTime() - ms);

describe("maintenanceStatus", () => {
    it("converts intervals and rejects bad input", () => {
        expect(intervalMs(2, "day")).toBe(2 * MS.day);
        expect(intervalMs(1, "month")).toBe(MS.month);
        expect(intervalMs(0, "day")).toBeNull();
        expect(intervalMs(1, "year")).toBeNull();
        expect(addInterval(NOW, 1, "hour").getTime()).toBe(NOW.getTime() + MS.hour);
        expect(addInterval(NOW, 1, "nope")).toBeNull();
    });

    it("is ok right after completion", () => {
        const item = { intervalValue: 1, intervalUnit: "week", createdAt: ago(10 * MS.day) };
        const res = computeStatus(item, ago(MS.hour), NOW);
        expect(res.status).toBe("ok");
        expect(res.lastCompletedAt).toEqual(ago(MS.hour));
    });

    it("is due inside the due-soon window", () => {
        const item = { intervalValue: 10, intervalUnit: "day", createdAt: ago(30 * MS.day) };
        // 10 day interval, 10% window = 1 day. Completed 9.5 days ago -> due in 12h.
        const res = computeStatus(item, ago(9.5 * MS.day), NOW);
        expect(res.status).toBe("due");
    });

    it("is overdue once the next due time has passed", () => {
        const item = { intervalValue: 1, intervalUnit: "day", createdAt: ago(5 * MS.day) };
        const res = computeStatus(item, ago(3 * MS.day), NOW);
        expect(res.status).toBe("overdue");
        expect(res.nextDueAt.getTime()).toBe(ago(2 * MS.day).getTime());
    });

    it("never-completed items anchor on createdAt and are due", () => {
        const item = { intervalValue: 1, intervalUnit: "month", createdAt: ago(MS.day) };
        const res = computeStatus(item, null, NOW);
        expect(res.status).toBe("due");
        expect(res.lastCompletedAt).toBeNull();
    });

    it("treats an invalid interval as due", () => {
        const res = computeStatus({ intervalValue: 0, intervalUnit: "day", createdAt: NOW }, null, NOW);
        expect(res.status).toBe("due");
        expect(res.nextDueAt).toBeNull();
    });
});
