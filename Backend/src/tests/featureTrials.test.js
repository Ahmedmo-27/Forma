import { afterEach, describe, expect, it, vi } from "vitest";
import { getEffectiveFeatures } from "../models/Tenant";
import {
    canRequestFeatureTrials,
    durationToDays,
    addDays,
    FEATURE_TRIAL_ACCESS_KEY,
} from "../utils/featureTrialAccess";
import FeatureTrialRequest from "../models/FeatureTrialRequest";
import Tenant from "../models/Tenant";
import { createRequest } from "../controllers/featureTrialController";
import {
    approveFeatureTrial,
    rejectFeatureTrial,
    grantFeatureTrial,
} from "../controllers/platformFeatureTrialController";

vi.mock("../services/featureRollout", () => ({
    applyRollout: (features) => features,
}));

vi.mock("../utils/audit", () => ({
    writeAudit: vi.fn().mockResolvedValue(true),
    writePlatformAudit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../utils/cacheInvalidator", () => ({
    invalidateTenantCache: vi.fn(),
}));

vi.mock("../services/featurePlanLookup", () => ({
    buildLockedFeatureCatalog: vi.fn(async () => []),
    activeFeatureTrials: vi.fn(() => []),
    getPlanForFeature: vi.fn(async () => ({ key: "gold", name: "Gold" })),
    invalidateFeaturePlanLookupCache: vi.fn(),
}));

vi.mock("../context/tenantContext", () => {
    const run = (fn) => Promise.resolve(typeof fn === "function" ? fn() : fn);
    return {
        runAsPlatform: run,
        runWithTenant: (_ctx, fn) => run(fn),
        getTenantId: () => "tenant-1",
        getTenantSlug: () => "gym",
    };
});

const basicPlan = {
    key: "basic",
    name: "Basic",
    features: ["members", "checkin", "packages"],
};

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe("feature trial entitlements", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("includes active featureTrials in getEffectiveFeatures", () => {
        const now = new Date("2026-06-01T12:00:00.000Z");
        const tenant = {
            featureOverrides: { add: [], remove: [] },
            featureTrials: [
                {
                    featureKey: "accounting",
                    startsAt: new Date("2026-05-20T12:00:00.000Z"),
                    endsAt: new Date("2026-06-15T12:00:00.000Z"),
                },
            ],
        };

        const features = getEffectiveFeatures(tenant, basicPlan, now);
        expect(features).toContain("accounting");
        expect(features).toContain("members");
    });

    it("ignores expired featureTrials", () => {
        const now = new Date("2026-06-01T12:00:00.000Z");
        const tenant = {
            featureOverrides: { add: [], remove: [] },
            featureTrials: [
                {
                    featureKey: "accounting",
                    startsAt: new Date("2026-04-01T12:00:00.000Z"),
                    endsAt: new Date("2026-05-01T12:00:00.000Z"),
                },
            ],
        };

        const features = getEffectiveFeatures(tenant, basicPlan, now);
        expect(features).not.toContain("accounting");
    });
});

describe("feature trial access helpers", () => {
    it("normalizes duration bounds", () => {
        expect(durationToDays(14, "days")).toBe(14);
        expect(durationToDays(2, "weeks")).toBe(14);
        expect(durationToDays(91, "days")).toBeNull();
        expect(durationToDays(13, "weeks")).toBeNull();
        expect(durationToDays(0, "days")).toBeNull();
    });

    it("adds whole days", () => {
        const start = new Date("2026-01-01T00:00:00.000Z");
        expect(addDays(start, 7).toISOString()).toBe("2026-01-08T00:00:00.000Z");
    });

    it("allows Owner and GM by default", () => {
        expect(canRequestFeatureTrials({ role: "Owner" })).toBe(true);
        expect(canRequestFeatureTrials({ role: "General Manager" })).toBe(true);
        expect(canRequestFeatureTrials({ role: "Receptionist" })).toBe(false);
    });

    it("allows staff with the request_feature_trials access grant", () => {
        expect(
            canRequestFeatureTrials({
                role: "Sales Manager",
                access: [FEATURE_TRIAL_ACCESS_KEY],
            })
        ).toBe(true);

        expect(
            canRequestFeatureTrials({
                role: "Sales Manager",
                featureAccess: { grants: [FEATURE_TRIAL_ACCESS_KEY], revokes: [] },
            })
        ).toBe(true);
    });
});

describe("feature trial request API", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rejects create when requester lacks permission", async () => {
        const req = {
            user: { role: "Receptionist", _id: "u1", access: [] },
            tenant: { _id: "t1", name: "Gym", slug: "gym", featureOverrides: {}, featureTrials: [] },
            plan: basicPlan,
            planFeatures: basicPlan.features,
            body: { featureKey: "accounting", durationValue: 7, durationUnit: "days" },
        };
        const res = mockRes();
        await createRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "FEATURE_TRIAL_FORBIDDEN" })
        );
    });

    it("creates a pending request for Owner", async () => {
        const created = {
            _id: "req-1",
            tenantId: "t1",
            featureKey: "accounting",
            featureName: "Ledger & Accounting",
            requestedDurationValue: 7,
            requestedDurationUnit: "days",
            requestedByUserId: "u1",
            requestedByName: "Owner",
            requestedByRole: "Owner",
            status: "pending",
            toObject() {
                return { ...this };
            },
        };
        vi.spyOn(FeatureTrialRequest, "create").mockResolvedValue(created);

        const req = {
            user: { role: "Owner", _id: "u1", id: "u1", name: "Owner", access: [] },
            tenant: {
                _id: "t1",
                name: "Gym",
                slug: "gym",
                featureOverrides: { add: [], remove: [] },
                featureTrials: [],
            },
            plan: basicPlan,
            planFeatures: basicPlan.features,
            body: { featureKey: "accounting", durationValue: 7, durationUnit: "days" },
        };
        const res = mockRes();
        await createRequest(req, res);

        expect(FeatureTrialRequest.create).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                request: expect.objectContaining({ featureKey: "accounting", status: "pending" }),
            })
        );
    });

    it("blocks duplicate pending via unique index error", async () => {
        const err = new Error("dup");
        err.code = 11000;
        vi.spyOn(FeatureTrialRequest, "create").mockRejectedValue(err);

        const req = {
            user: { role: "Owner", _id: "u1", id: "u1", name: "Owner" },
            tenant: {
                _id: "t1",
                name: "Gym",
                slug: "gym",
                featureOverrides: { add: [], remove: [] },
                featureTrials: [],
            },
            plan: basicPlan,
            body: { featureKey: "accounting", durationValue: 7, durationUnit: "days" },
        };
        const res = mockRes();
        await createRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "PENDING_REQUEST_EXISTS" })
        );
    });

    it("rejects when feature already enabled", async () => {
        const req = {
            user: { role: "Owner", _id: "u1", id: "u1" },
            tenant: {
                _id: "t1",
                name: "Gym",
                slug: "gym",
                featureOverrides: { add: [], remove: [] },
                featureTrials: [],
            },
            plan: basicPlan,
            body: { featureKey: "members", durationValue: 7, durationUnit: "days" },
        };
        const res = mockRes();
        await createRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "FEATURE_ALREADY_ENABLED" })
        );
    });
});

describe("platform feature trial decisions", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("writes tenant.featureTrials on approve", async () => {
        const now = new Date("2026-06-01T00:00:00.000Z");
        vi.useFakeTimers();
        vi.setSystemTime(now);

        const doc = {
            _id: "req-1",
            tenantId: "t1",
            featureKey: "accounting",
            status: "pending",
            requestedDurationValue: 14,
            requestedDurationUnit: "days",
            tenantSlug: "gym",
            adminNote: "",
            save: vi.fn().mockResolvedValue(undefined),
            toObject() {
                return { ...this };
            },
        };
        const tenant = {
            _id: "t1",
            slug: "gym",
            featureTrials: [],
            markModified: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
        };

        vi.spyOn(FeatureTrialRequest, "findById").mockResolvedValue(doc);
        vi.spyOn(Tenant, "findById").mockResolvedValue(tenant);

        const req = {
            params: { id: "req-1" },
            body: { durationValue: 7, durationUnit: "days" },
            platformUser: { id: "admin-1" },
        };
        const res = mockRes();

        await approveFeatureTrial(req, res);

        expect(doc.status).toBe("approved");
        expect(doc.approvedDurationValue).toBe(7);
        expect(doc.trialEndsAt.toISOString()).toBe("2026-06-08T00:00:00.000Z");
        expect(tenant.featureTrials).toHaveLength(1);
        expect(tenant.featureTrials[0].featureKey).toBe("accounting");
        expect(tenant.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                featureTrial: expect.objectContaining({ featureKey: "accounting" }),
            })
        );
    });

    it("rejects without granting a trial", async () => {
        const doc = {
            _id: "req-2",
            tenantId: "t1",
            featureKey: "accounting",
            status: "pending",
            tenantSlug: "gym",
            adminNote: "",
            save: vi.fn().mockResolvedValue(undefined),
            toObject() {
                return { ...this };
            },
        };
        vi.spyOn(FeatureTrialRequest, "findById").mockResolvedValue(doc);
        const tenantSpy = vi.spyOn(Tenant, "findById");

        const req = {
            params: { id: "req-2" },
            body: { note: "Not a fit" },
            platformUser: { id: "admin-1" },
        };
        const res = mockRes();
        await rejectFeatureTrial(req, res);

        expect(doc.status).toBe("rejected");
        expect(doc.adminNote).toBe("Not a fit");
        expect(tenantSpy).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                request: expect.objectContaining({ status: "rejected" }),
            })
        );
    });

    it("grants a platform-initiated trial for a tenant", async () => {
        const now = new Date("2026-06-01T00:00:00.000Z");
        vi.useFakeTimers();
        vi.setSystemTime(now);

        const tenant = {
            _id: "t1",
            name: "Gym",
            slug: "gym",
            planId: basicPlan,
            featureOverrides: { add: [], remove: [] },
            featureTrials: [],
            markModified: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
        };

        const created = {
            _id: "grant-1",
            tenantId: "t1",
            featureKey: "accounting",
            featureName: "Ledger & Accounting",
            status: "approved",
            source: "platform",
            requestedDurationValue: 14,
            requestedDurationUnit: "days",
            toObject() {
                return { ...this };
            },
        };

        vi.spyOn(Tenant, "findById").mockReturnValue({
            populate: vi.fn().mockResolvedValue(tenant),
        });
        vi.spyOn(FeatureTrialRequest, "updateMany").mockResolvedValue({ modifiedCount: 0 });
        vi.spyOn(FeatureTrialRequest, "create").mockResolvedValue(created);

        const req = {
            params: { id: "t1" },
            body: { featureKey: "accounting", durationValue: 14, durationUnit: "days", note: "Pilot" },
            platformUser: { id: "admin-1", email: "admin@forma.app" },
        };
        const res = mockRes();
        await grantFeatureTrial(req, res);

        expect(FeatureTrialRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
                featureKey: "accounting",
                source: "platform",
                status: "approved",
                requestedByUserId: null,
            })
        );
        expect(tenant.featureTrials).toHaveLength(1);
        expect(tenant.featureTrials[0].featureKey).toBe("accounting");
        expect(tenant.featureTrials[0].endsAt.toISOString()).toBe("2026-06-15T00:00:00.000Z");
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                featureTrial: expect.objectContaining({ featureKey: "accounting" }),
            })
        );
    });

    it("rejects platform grant when feature already enabled", async () => {
        const tenant = {
            _id: "t1",
            name: "Gym",
            slug: "gym",
            planId: basicPlan,
            featureOverrides: { add: [], remove: [] },
            featureTrials: [],
            markModified: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(Tenant, "findById").mockReturnValue({
            populate: vi.fn().mockResolvedValue(tenant),
        });

        const req = {
            params: { id: "t1" },
            body: { featureKey: "members", durationValue: 7, durationUnit: "days" },
            platformUser: { id: "admin-1" },
        };
        const res = mockRes();
        await grantFeatureTrial(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "FEATURE_ALREADY_ENABLED" })
        );
    });

    it("rejects platform grant for unknown feature keys", async () => {
        const req = {
            params: { id: "t1" },
            body: { featureKey: "not_real", durationValue: 7, durationUnit: "days" },
            platformUser: { id: "admin-1" },
        };
        const res = mockRes();
        await grantFeatureTrial(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "INVALID_FEATURE" })
        );
    });
});
