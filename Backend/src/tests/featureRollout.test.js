import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const Feature = require("../models/Feature");
const Tenant = require("../models/Tenant");
const AuditLog = require("../models/AuditLog");
const featureRollout = require("../services/featureRollout");
const { updateFeature } = require("../controllers/platformPlanController");

const { getEffectiveFeatures } = Tenant;
const plan = { features: ["members", "inbox", "business_intelligence"] };

function tenantWith(id, extra = {}) {
    return { _id: new mongoose.Types.ObjectId(id), featureOverrides: { add: [], remove: [] }, ...extra };
}

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe("feature rollouts", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        featureRollout._setRulesForTest([]);
    });

    afterEach(() => {
        featureRollout._setRulesForTest([]);
    });

    it("leaves plan features untouched when nothing is staged", () => {
        expect(getEffectiveFeatures(tenantWith(), plan)).toEqual(plan.features);
    });

    it("limits a pilot feature to the listed gyms", () => {
        const pilot = tenantWith();
        featureRollout._setRulesForTest([{ key: "inbox", rollout: { mode: "pilot", pilotTenantIds: [pilot._id] } }]);

        expect(getEffectiveFeatures(pilot, plan)).toContain("inbox");
        expect(getEffectiveFeatures(tenantWith(), plan)).not.toContain("inbox");
        expect(getEffectiveFeatures(tenantWith(), plan)).toContain("members");
    });

    it("turns a feature off everywhere except explicit per-gym grants", () => {
        featureRollout._setRulesForTest([{ key: "inbox", rollout: { mode: "off" } }]);
        const granted = tenantWith(undefined, { featureOverrides: { add: ["inbox"], remove: [] } });

        expect(getEffectiveFeatures(tenantWith(), plan)).not.toContain("inbox");
        expect(getEffectiveFeatures(granted, plan)).toContain("inbox");
    });

    it("gives a stable share of gyms in percentage mode, growing monotonically", () => {
        const tenants = Array.from({ length: 400 }, () => tenantWith());
        const enabledAt = (percentage) => {
            featureRollout._setRulesForTest([{ key: "inbox", rollout: { mode: "percentage", percentage } }]);
            return new Set(tenants.filter((t) => getEffectiveFeatures(t, plan).includes("inbox")).map((t) => String(t._id)));
        };

        const at25 = enabledAt(25);
        const at50 = enabledAt(50);
        expect(at25.size).toBeGreaterThan(60);
        expect(at25.size).toBeLessThan(140);
        for (const id of at25) expect(at50.has(id)).toBe(true);
        expect(enabledAt(0).size).toBe(0);
        expect(enabledAt(100).size).toBe(400);
    });

    it("never enables a feature the plan does not include", () => {
        const pilot = tenantWith();
        featureRollout._setRulesForTest([{ key: "funnels", rollout: { mode: "pilot", pilotTenantIds: [pilot._id] } }]);
        expect(getEffectiveFeatures(pilot, plan)).not.toContain("funnels");
    });

    describe("updateFeature rollout", () => {
        const admin = { id: new mongoose.Types.ObjectId().toString(), email: "ops@forma.app" };

        it("resolves pilot gyms by slug, saves, and audits the change", async () => {
            const featureId = new mongoose.Types.ObjectId();
            const pilotId = new mongoose.Types.ObjectId();
            vi.spyOn(Tenant, "find").mockReturnValue({
                select: () => ({ lean: () => Promise.resolve([{ _id: pilotId, slug: "nile-gym" }]) }),
            });
            vi.spyOn(Feature, "findById").mockReturnValue({
                select: () => ({ lean: () => Promise.resolve({ key: "inbox", isCore: false, rollout: { mode: "all" } }) }),
            });
            const saved = { _id: featureId, key: "inbox", rollout: { mode: "pilot", percentage: 0, pilotTenantIds: [pilotId] } };
            const update = vi.spyOn(Feature, "findByIdAndUpdate").mockResolvedValue(saved);
            vi.spyOn(featureRollout, "refreshRules").mockResolvedValue();
            const audit = vi.spyOn(AuditLog, "create").mockResolvedValue({});
            const res = mockRes();

            await updateFeature(
                { params: { id: String(featureId) }, body: { rollout: { mode: "pilot", pilotTenants: ["Nile-Gym"] }, reason: "Beta" }, platformUser: admin },
                res
            );

            expect(update.mock.calls[0][1].rollout).toEqual({ mode: "pilot", percentage: 0, pilotTenantIds: [pilotId] });
            expect(res.json).toHaveBeenCalledWith(saved);
            expect(audit).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: "feature_rollout_updated",
                    meta: expect.objectContaining({
                        featureKey: "inbox",
                        before: { mode: "all", percentage: 0, pilotCount: 0 },
                        after: { mode: "pilot", percentage: 0, pilotCount: 1 },
                    }),
                })
            );
        });

        it("rejects unknown pilot gyms", async () => {
            vi.spyOn(Tenant, "find").mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
            const update = vi.spyOn(Feature, "findByIdAndUpdate");
            const res = mockRes();

            await updateFeature(
                { params: { id: String(new mongoose.Types.ObjectId()) }, body: { rollout: { mode: "pilot", pilotTenants: ["ghost-gym"] } }, platformUser: admin },
                res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].message).toContain("ghost-gym");
            expect(update).not.toHaveBeenCalled();
        });

        it("refuses to stage a core feature", async () => {
            vi.spyOn(Feature, "findById").mockReturnValue({
                select: () => ({ lean: () => Promise.resolve({ key: "members", isCore: true, rollout: { mode: "all" } }) }),
            });
            const update = vi.spyOn(Feature, "findByIdAndUpdate");
            const res = mockRes();

            await updateFeature(
                { params: { id: String(new mongoose.Types.ObjectId()) }, body: { rollout: { mode: "off" } }, platformUser: admin },
                res
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(update).not.toHaveBeenCalled();
        });
    });
});
