import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { computeDays } from "./metrics";

const require = createRequire(import.meta.url);
const { runWithTenant } = require("../../context/tenantContext");
const tenantPlugin = require("../../plugins/tenantPlugin");

describe("bi tenant isolation", () => {
    it("injects tenantId into snapshot, objective, and insight queries", () => {
        const schema = new mongoose.Schema({ name: String });
        schema.plugin(tenantPlugin);
        const findHook = schema.s.hooks._pres.get("find")[0].fn;
        const tenantId = new mongoose.Types.ObjectId().toString();
        for (const label of ["TenantMetricSnapshot", "Objective", "Insight"]) {
            const mockQuery = { where: vi.fn(), label };
            runWithTenant({ tenantId }, () => {
                findHook.call(mockQuery);
            });
            expect(mockQuery.where).toHaveBeenCalledWith({
                tenantId: new mongoose.Types.ObjectId(tenantId),
            });
        }
    });

    it("never copies another gym's members into a computed day", () => {
        const random = Array.from({ length: 30 }, (_, index) => ({
            _id: `m-${index}`,
            name: index % 2 === 0 ? `Alpha ${index}` : `Beta ${index}`,
            systemId: 1000 + index,
            status: "active",
            phones: `010${String(10000000 + index)}`,
            source: "Walk in",
            createdAt: "2026-04-01T08:00:00.000Z",
            subscriptions: index % 3 === 0 ? [{
                startDate: "2026-04-01T08:00:00.000Z",
                endDate: "2026-05-01T08:00:00.000Z",
                pricePaid: 100 + index,
                packageSnapshot: { name: "M", duration: "1 month", price: 100, activityType: "gym" },
            }] : [],
            userlog: [],
            notes: [],
            freeze: [],
            pt_subscriptions: [],
            tenantTag: index % 2 === 0 ? "A" : "B",
        }));
        const alpha = computeDays({
            members: random.filter((row) => row.tenantTag === "A"),
            dateKeys: ["2026-04-01"],
            timeZone: "Africa/Cairo",
            now: new Date("2026-04-02T10:00:00.000Z"),
            focusDate: "2026-04-01",
        });
        const blob = JSON.stringify(alpha);
        for (const row of random.filter((item) => item.tenantTag === "B")) {
            expect(blob).not.toContain(row.name);
            expect(blob).not.toContain(row.phones);
        }
    });
});
