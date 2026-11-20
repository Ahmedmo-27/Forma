import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "module";
import mongoose from "mongoose";
import announcementRouter from "../routes/announcementRoutes";
import locationRouter from "../routes/locationRoutes";
import maintenanceRouter from "../routes/maintenanceRoutes";
import membersRouter from "../routes/membersRoutes";
import notificationRouter from "../routes/notificationRoutes";
import retailRouter from "../routes/retailRoutes";
import taskRouter from "../routes/taskRoutes";
import tenantRouter from "../routes/tenantRoutes";
import userRouter from "../routes/userRoutes";

const require = createRequire(import.meta.url);
const registry = require("../config/featureRegistry");
const { AREAS } = require("../config/roleAccess");
const Plan = require("../models/Plan");
const Tenant = require("../models/Tenant");
const Feature = require("../models/Feature");
const featureRollout = require("../services/featureRollout");
const featureSync = require("../services/featureSync");
const { createPlan } = require("../controllers/platformPlanController");
const { requireFeature } = require("../middleware/featureGating");

const { getEffectiveFeatures } = Tenant;
const { FEATURES, FEATURE_KEYS, CATEGORIES, MODULE_KEYS } = registry;

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

/** Feature keys guarding a router: whole-router `use` layers and per-route handlers. */
function routerFeatureKeys(router, { path, method } = {}) {
    const keys = new Set();
    for (const layer of router.stack) {
        if (layer.route) {
            if (path && layer.route.path !== path) continue;
            if (method && !layer.route.methods[method]) continue;
            for (const entry of layer.route.stack) if (entry.handle.featureKey) keys.add(entry.handle.featureKey);
        } else if (!path && layer.handle?.featureKey) {
            keys.add(layer.handle.featureKey);
        }
    }
    return [...keys];
}

describe("feature registry", () => {
    it("has unique keys, valid categories and at least one page per feature", () => {
        expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
        for (const feature of FEATURES) {
            expect(CATEGORIES, feature.key).toContain(feature.category);
            expect(feature.pages?.length, feature.key).toBeGreaterThan(0);
        }
    });

    it("drives the plan model's feature list", () => {
        expect(Plan.ALL_FEATURES).toEqual(FEATURE_KEYS);
    });

    it("covers every plan feature named by a role-access area", () => {
        for (const area of AREAS) {
            if (!area.planFeature) continue;
            expect(FEATURE_KEYS, area.key).toContain(area.planFeature);
        }
    });

    it("only backfills module keys onto existing plans", () => {
        expect(MODULE_KEYS.length).toBeGreaterThan(0);
        for (const key of MODULE_KEYS) {
            expect(FEATURES.find((feature) => feature.key === key).backfill).toBe("all");
        }
        expect(FEATURES.find((feature) => feature.key === "inbox").backfill).toBeNull();
    });
});

describe("getEffectiveFeatures", () => {
    const plan = { features: ["members", "retail", "tasks"] };
    const tenant = (extra = {}) => ({
        _id: new mongoose.Types.ObjectId(),
        featureOverrides: { add: [], remove: [] },
        billing: {},
        ...extra,
    });

    beforeEach(() => featureRollout._setRulesForTest([]));
    afterEach(() => featureRollout._setRulesForTest([]));

    it("starts from the plan", () => {
        expect(getEffectiveFeatures(tenant(), plan).sort()).toEqual(["members", "retail", "tasks"]);
    });

    it("adds and removes per gym", () => {
        const gym = tenant({ featureOverrides: { add: ["maintenance"], remove: ["retail"] } });
        const effective = getEffectiveFeatures(gym, plan);
        expect(effective).toContain("maintenance");
        expect(effective).not.toContain("retail");
        expect(effective).toContain("members");
    });

    it("uses the frozen snapshot for lifetime gyms on the snapshot policy", () => {
        const gym = tenant({
            billing: { cycle: "lifetime", lifetime: { entitlementPolicy: "snapshot", featureSnapshot: ["members"] } },
        });
        expect(getEffectiveFeatures(gym, plan)).toEqual(["members"]);

        const follower = tenant({
            billing: { cycle: "lifetime", lifetime: { entitlementPolicy: "follow_tier", featureSnapshot: ["members"] } },
        });
        expect(getEffectiveFeatures(follower, plan)).toContain("retail");
    });

    it("withholds a staged feature from gyms outside the rollout", () => {
        const pilot = tenant();
        featureRollout._setRulesForTest([{ key: "retail", rollout: { mode: "pilot", pilotTenantIds: [pilot._id] } }]);
        expect(getEffectiveFeatures(pilot, plan)).toContain("retail");
        expect(getEffectiveFeatures(tenant(), plan)).not.toContain("retail");
    });

    it("hides a platform-wide deactivated feature even when a gym was granted it", () => {
        featureRollout._setRulesForTest([{ key: "retail", isActive: false, rollout: { mode: "all" } }]);
        const granted = tenant({ featureOverrides: { add: ["retail", "maintenance"], remove: [] } });
        const effective = getEffectiveFeatures(granted, plan);
        expect(effective).not.toContain("retail");
        expect(effective).toContain("maintenance");
        expect(getEffectiveFeatures(tenant(), plan)).not.toContain("retail");
    });
});

describe("requireFeature on every tenant module", () => {
    const ctx = (features) => ({
        user: { tenantId: "t1" },
        tenant: { featureOverrides: { add: [], remove: [] } },
        plan: { features },
    });

    it.each([
        ["retail", retailRouter],
        ["maintenance", maintenanceRouter],
        ["tasks", taskRouter],
        ["notifications", notificationRouter],
        ["notifications", announcementRouter],
    ])("gates the whole %s router", (key, router) => {
        expect(routerFeatureKeys(router)).toContain(key);
    });

    it("gates location writes but leaves the branch list open", () => {
        expect(routerFeatureKeys(locationRouter, { path: "/", method: "post" })).toContain("locations");
        expect(routerFeatureKeys(locationRouter, { path: "/:id", method: "patch" })).toContain("locations");
        expect(routerFeatureKeys(locationRouter, { path: "/:id", method: "delete" })).toContain("locations");
        expect(routerFeatureKeys(locationRouter, { path: "/", method: "get" })).toEqual([]);
    });

    it("gates staff, access, and coaching endpoints", () => {
        expect(routerFeatureKeys(userRouter, { path: "/staff", method: "post" })).toContain("staff_management");
        expect(routerFeatureKeys(userRouter, { path: "/:id/access", method: "put" })).toContain("access_control");
        expect(routerFeatureKeys(userRouter, { path: "/coach-team", method: "get" })).toContain("coaching");
        expect(routerFeatureKeys(tenantRouter, { path: "/access/:role", method: "put" })).toContain("access_control");
        expect(routerFeatureKeys(membersRouter, { path: "/bulk-transfer-sales", method: "post" })).toContain("tasks");
        expect(routerFeatureKeys(membersRouter, { path: "/:memberId/assign-coach", method: "patch" })).toContain("coaching");
    });

    it("blocks a gym whose plan lacks the module and passes one that has it", async () => {
        const blocked = mockRes();
        const next = vi.fn();
        await requireFeature("retail")(ctx(["members"]), blocked, next);
        expect(next).not.toHaveBeenCalled();
        expect(blocked.status).toHaveBeenCalledWith(403);
        expect(blocked.json).toHaveBeenCalledWith(expect.objectContaining({ code: "FEATURE_NOT_IN_PLAN", feature: "retail" }));

        const open = vi.fn();
        await requireFeature("retail")(ctx(["members", "retail"]), mockRes(), open);
        expect(open).toHaveBeenCalled();
    });

    it("honours a per-gym removal of a module the plan includes", async () => {
        const req = ctx(["members", "tasks"]);
        req.tenant.featureOverrides = { add: [], remove: ["tasks"] };
        const res = mockRes();
        const next = vi.fn();
        await requireFeature("tasks")(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe("custom plan keys", () => {
    afterEach(() => vi.restoreAllMocks());

    it("accepts slugs beyond the old basic/gold/platinum set", () => {
        for (const key of ["enterprise-plus", "starter", "tier_2", "gym-chain-2026"]) {
            expect(Plan.PLAN_KEY_PATTERN.test(key), key).toBe(true);
        }
        for (const key of ["A", "Bad Key!", "-lead", "x".repeat(40)]) {
            expect(Plan.PLAN_KEY_PATTERN.test(key), key).toBe(false);
        }
    });

    it("creates a plan with a custom key and rejects an unknown feature", async () => {
        vi.spyOn(Plan, "findOne").mockResolvedValue(null);
        const created = vi.spyOn(Plan, "create").mockImplementation(async (doc) => doc);
        vi.spyOn(Feature, "find").mockReturnValue({ select: () => ({ lean: async () => [] }) });

        const ok = mockRes();
        await createPlan({ body: { key: " Enterprise-Plus ", name: "Enterprise Plus", priceMonthly: 100, priceYearly: 1000, features: ["members", "retail"] } }, ok);
        expect(ok.status).toHaveBeenCalledWith(201);
        expect(created).toHaveBeenCalledWith(expect.objectContaining({ key: "enterprise-plus", features: ["members", "retail"] }));

        const bad = mockRes();
        await createPlan({ body: { key: "ok-key", name: "Ok", features: ["not_a_feature"] } }, bad);
        expect(bad.status).toHaveBeenCalledWith(400);
        expect(bad.json).toHaveBeenCalledWith({ message: "Unknown feature: not_a_feature" });

        const badKey = mockRes();
        await createPlan({ body: { key: "Bad Key!", name: "Nope" } }, badKey);
        expect(badKey.status).toHaveBeenCalledWith(400);
    });
});

describe("feature catalog sync", () => {
    const store = new Map();

    function wireStore() {
        store.clear();
        vi.spyOn(Feature, "findOneAndUpdate").mockImplementation((filter, update) => {
            const before = store.get(filter.key) || null;
            if (!before) store.set(filter.key, { ...update.$setOnInsert });
            return { select: () => ({ lean: async () => (before ? { ...before } : null) }) };
        });
        vi.spyOn(Feature, "updateOne").mockImplementation(async (filter, update) => {
            const row = store.get(filter.key);
            if (row && row.plansBackfilledAt == null) row.plansBackfilledAt = update.$set.plansBackfilledAt;
            return {};
        });
        vi.spyOn(Feature, "deleteMany").mockResolvedValue({});
        vi.spyOn(Plan, "updateMany").mockResolvedValue({});
        vi.spyOn(Plan, "updateOne").mockResolvedValue({});
        vi.spyOn(Tenant, "updateMany").mockResolvedValue({});
    }

    const backfilledKeys = () =>
        Plan.updateMany.mock.calls
            .filter(([, update]) => update.$addToSet)
            .map(([, update]) => update.$addToSet.features);

    beforeEach(() => {
        featureSync._resetForTest();
        wireStore();
    });
    afterEach(() => vi.restoreAllMocks());

    it("registers every feature and backfills each module key onto all plans once", async () => {
        const first = await featureSync.syncFeatureCatalog();
        expect(first.created.sort()).toEqual([...FEATURE_KEYS].sort());
        expect(first.backfilled.sort()).toEqual([...MODULE_KEYS].sort());
        expect(backfilledKeys().sort()).toEqual([...MODULE_KEYS].sort());
    });

    it("does nothing the second time, so operator edits to plans survive", async () => {
        await featureSync.syncFeatureCatalog();
        Plan.updateMany.mockClear();
        Tenant.updateMany.mockClear();

        const second = await featureSync.syncFeatureCatalog();
        expect(second.created).toEqual([]);
        expect(second.backfilled).toEqual([]);
        expect(backfilledKeys()).toEqual([]);
    });

    it("retires removed keys from plans, snapshots, and overrides", async () => {
        await featureSync.syncFeatureCatalog();
        expect(Feature.deleteMany).toHaveBeenCalledWith({ key: { $in: registry.RETIRED_FEATURES } });
        expect(Plan.updateMany).toHaveBeenCalledWith(
            { features: { $in: registry.RETIRED_FEATURES } },
            { $pull: { features: { $in: registry.RETIRED_FEATURES } } }
        );
    });
});
