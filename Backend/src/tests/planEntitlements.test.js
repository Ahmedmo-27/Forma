import { afterEach, describe, expect, it, vi } from "vitest";
import User from "../models/User";
import { change_Role } from "../controllers/userController";
import { sanitizeTenantResponse } from "../controllers/tenantController";
import { requireFeature } from "../middleware/featureGating";
import { enforceStaffLimit } from "../middleware/tenantStatus";
import { attachPlanFeatures } from "../middleware/authMiddleware";
import { resolveEffectiveAreas } from "../config/roleAccess";
import userRouter from "../routes/userRoutes";

vi.mock("../utils/audit", () => ({
    writeAudit: vi.fn().mockResolvedValue(undefined),
}));

const basicPlan = {
    name: "Basic Plan",
    key: "basic",
    features: ["members", "checkin", "packages", "pt_tracking", "audit"],
    allowedRoles: ["Owner", "Receptionist", "Coach", "Head Coach"],
    limits: { maxStaff: 5, maxMembers: 300, maxBranches: 1 },
};

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

function staffUser(role) {
    return {
        _id: "staff-1",
        id: "staff-1",
        role,
        featureAccess: { grants: [], revokes: [] },
        accessOverrides: { add: [], remove: [] },
        abilities: {},
        markModified() {},
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function routeFeatureKeys(path, method) {
    const layer = userRouter.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
    return (layer?.route.stack || []).map((entry) => entry.handle.featureKey).filter(Boolean);
}

describe("plan entitlements", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rejects a Basic role change to General Manager or Accountant", async () => {
        const user = staffUser("Receptionist");
        vi.spyOn(User, "findById").mockResolvedValue(user);
        const req = {
            params: { id: "staff-1", new_role: "General Manager" },
            user: { id: "owner-1", role: "Owner" },
            tenant: { roleOverrides: { add: [], remove: [] } },
            plan: basicPlan,
        };
        const res = mockRes();

        await change_Role(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "ROLE_NOT_IN_PLAN",
            role: "General Manager",
        }));
        expect(user.role).toBe("Receptionist");
        expect(user.save).not.toHaveBeenCalled();

        const existing = staffUser("General Manager");
        User.findById.mockResolvedValue(existing);
        req.params.new_role = "General Manager";
        const keepRes = mockRes();
        await change_Role(req, keepRes);
        expect(keepRes.status).not.toHaveBeenCalled();
        expect(keepRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Role unchanged" }));
        expect(existing.save).not.toHaveBeenCalled();

        req.params.new_role = "Accountant";
        const accountantRes = mockRes();
        await change_Role(req, accountantRes);
        expect(accountantRes.status).toHaveBeenCalledWith(403);
        expect(accountantRes.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "ROLE_NOT_IN_PLAN",
            role: "Accountant",
        }));
    });

    it("allows a General Manager when the gym is granted that role", async () => {
        const user = staffUser("Receptionist");
        vi.spyOn(User, "findById").mockResolvedValue(user);
        vi.spyOn(User, "countDocuments").mockResolvedValue(0);
        const tenant = { roleOverrides: { add: ["General Manager"], remove: [] } };
        const req = {
            params: { id: "staff-1", new_role: "General Manager" },
            user: { id: "owner-1", role: "Owner" },
            tenant,
            plan: basicPlan,
            body: { role: "General Manager" },
        };
        const res = mockRes();

        await change_Role(req, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(user.role).toBe("General Manager");
        expect(user.save).toHaveBeenCalled();

        const createRes = mockRes();
        const next = vi.fn();
        await enforceStaffLimit(req, createRes, next);
        expect(next).toHaveBeenCalled();
        expect(createRes.status).not.toHaveBeenCalled();
    });

    it("blocks a sales target without accounting and allows a feature override", async () => {
        expect(routeFeatureKeys("/:id/target", "patch")).toContain("accounting");
        expect(routeFeatureKeys("/sales-revenue", "get")).toContain("sales_crm");
        expect(routeFeatureKeys("/my-subscriptions", "get")).toContain("sales_crm");
        expect(routeFeatureKeys("/sales-reps", "get")).toContain("sales_crm");
        expect(routeFeatureKeys("/team", "get")).toContain("sales_crm");
        expect(routeFeatureKeys("/team/:id", "get")).toContain("sales_crm");
        expect(routeFeatureKeys("/sales-manager/subscriptions", "get")).toContain("accounting");
        expect(routeFeatureKeys("/sales", "get")).not.toContain("sales_crm");

        const denied = mockRes();
        const denyNext = vi.fn();
        await requireFeature("accounting")({
            user: { tenantId: "tenant-1" },
            tenant: { featureOverrides: { add: [], remove: [] } },
            plan: basicPlan,
        }, denied, denyNext);
        expect(denyNext).not.toHaveBeenCalled();
        expect(denied.status).toHaveBeenCalledWith(403);
        expect(denied.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "FEATURE_NOT_IN_PLAN",
            feature: "accounting",
        }));

        const allowed = mockRes();
        const allowNext = vi.fn();
        await requireFeature("accounting")({
            user: { tenantId: "tenant-1" },
            tenant: { featureOverrides: { add: ["accounting"], remove: [] } },
            plan: basicPlan,
        }, allowed, allowNext);
        expect(allowNext).toHaveBeenCalled();
        expect(allowed.status).not.toHaveBeenCalled();
    });

    it("attaches effective features, including overrides, for later access checks", () => {
        const req = {
            tenant: { featureOverrides: { add: ["accounting"], remove: ["checkin"] } },
            plan: basicPlan,
        };
        attachPlanFeatures(req);
        expect(req.planFeatures).toContain("accounting");
        expect(req.planFeatures).toContain("members");
        expect(req.planFeatures).not.toContain("checkin");
        expect(req.planFeatures).not.toContain("sales_crm");

        const areas = resolveEffectiveAreas({
            role: "Owner",
            planFeatures: req.planFeatures,
        });
        expect(areas).not.toContain("sales");
        expect(areas).toContain("accounting");
        expect(areas).not.toContain("checkin");
    });

    it("returns effective roles on the tenant payload", () => {
        const payload = sanitizeTenantResponse({
            _id: "tenant-1",
            name: "Basic Gym",
            slug: "basic-gym",
            status: "active",
            roleOverrides: { add: ["General Manager"], remove: [] },
            featureOverrides: { add: [], remove: [] },
        }, basicPlan);
        expect(payload.effectiveRoles).toContain("General Manager");
        expect(payload.effectiveRoles).toContain("Receptionist");
        expect(payload.effectiveRoles).not.toContain("Accountant");
    });
});
