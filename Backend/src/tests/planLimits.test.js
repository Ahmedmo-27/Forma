import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import Plan from "../models/Plan";
import Member from "../models/Member";
import User from "../models/User";
import Location from "../models/Location";
import AuditLog from "../models/AuditLog";
import BillingEvent from "../models/BillingEvent";
import PlatformSetting from "../models/PlatformSetting";
import { updateTenantLifecycle } from "../controllers/platformTenantController";
import { issueManualGrant } from "../controllers/platformBillingController";
import {
    findOverages,
    assessLimitChange,
    overLimitResponse,
    planLimitPayload,
} from "../services/planLimitService";

const adminUser = { id: new mongoose.Types.ObjectId().toString(), email: "ops@forma.app", role: "super_admin" };
const gold = { _id: new mongoose.Types.ObjectId(), key: "gold", name: "Gold Plan", limits: { maxMembers: 1500, maxStaff: 15, maxBranches: 2 } };
const basic = { _id: new mongoose.Types.ObjectId(), key: "basic", name: "Basic Plan", limits: { maxMembers: 300, maxStaff: 5, maxBranches: 1 } };

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

function mockUsage({ members = 0, staff = 0, branches = 0 }) {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    vi.spyOn(Member, "countDocuments").mockResolvedValue(members);
    vi.spyOn(User, "countDocuments").mockResolvedValue(staff);
    vi.spyOn(Location, "countDocuments").mockResolvedValue(branches);
}

describe("plan limit enforcement", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
        vi.spyOn(PlatformSetting, "findOne").mockResolvedValue(null);
    });

    describe("findOverages", () => {
        it("reports only caps the gym exceeds, with how many are extra", () => {
            const overages = findOverages(
                { maxMembers: 300, maxStaff: 15, maxBranches: 2 },
                { members: 300, staff: 21, branches: 3 }
            );
            expect(overages).toEqual([
                { limit: "maxStaff", noun: "staff accounts", current: 21, max: 15, excess: 6 },
                { limit: "maxBranches", noun: "branches", current: 3, max: 2, excess: 1 },
            ]);
        });

        it("treats missing or non-positive caps as unlimited", () => {
            expect(findOverages({ maxMembers: null, maxStaff: 0, maxBranches: -1 }, { members: 9999, staff: 99, branches: 9 })).toEqual([]);
        });
    });

    it("applies new limit overrides on top of the plan when assessing a change", async () => {
        const tenant = { _id: new mongoose.Types.ObjectId(), limitOverrides: { maxStaff: 30 } };
        const keep = await assessLimitChange(tenant, { plan: gold, usage: { members: 10, staff: 21, branches: 1 } });
        expect(keep.overages).toEqual([]);

        const cleared = await assessLimitChange(tenant, {
            plan: gold,
            limitOverrides: { maxStaff: null },
            usage: { members: 10, staff: 21, branches: 1 },
        });
        expect(cleared.overages.map((o) => o.limit)).toEqual(["maxStaff"]);
    });

    it("builds a 409 body the frontend can read from details", () => {
        const body = overLimitResponse([{ limit: "maxStaff", noun: "staff accounts", current: 21, max: 15, excess: 6 }], "Gold Plan");
        expect(body.code).toBe("PLAN_DOWNGRADE_OVER_LIMIT");
        expect(body.message).toContain("21 staff accounts (limit 15)");
        expect(body.details.overages).toHaveLength(1);
    });

    it("keeps the create-time PLAN_LIMIT_REACHED shape", () => {
        const body = planLimitPayload({ limit: "maxBranches", current: 2, max: 2, message: "full", requestId: "r1" });
        expect(body).toMatchObject({ code: "PLAN_LIMIT_REACHED", limit: "maxBranches", current: 2, max: 2 });
        expect(body.error).toMatchObject({ code: "PLAN_LIMIT_REACHED", status: 403, details: { limit: "maxBranches", current: 2, max: 2 } });
    });

    describe("change_plan lifecycle action", () => {
        function tenantOn(plan) {
            const tenant = {
                _id: new mongoose.Types.ObjectId(),
                name: "Nile Gym",
                status: "active",
                planId: plan,
                billing: { cycle: "monthly" },
                limitOverrides: {},
                save: vi.fn().mockResolvedValue(true),
            };
            vi.spyOn(Tenant, "findById").mockReturnValue({ populate: vi.fn().mockResolvedValue(tenant) });
            return tenant;
        }

        it("refuses a downgrade that leaves the gym over its caps", async () => {
            const tenant = tenantOn(gold);
            mockUsage({ members: 120, staff: 21, branches: 2 });
            vi.spyOn(Plan, "findOne").mockResolvedValue(basic);
            const res = mockRes();

            await updateTenantLifecycle(
                { params: { id: String(tenant._id) }, body: { action: "change_plan", newPlanKey: "basic", reason: "Customer asked to downgrade" }, platformUser: adminUser },
                res
            );

            expect(res.status).toHaveBeenCalledWith(409);
            const body = res.json.mock.calls[0][0];
            expect(body.code).toBe("PLAN_DOWNGRADE_OVER_LIMIT");
            expect(body.details.overages.map((o) => o.limit)).toEqual(["maxStaff", "maxBranches"]);
            expect(tenant.save).not.toHaveBeenCalled();
            expect(tenant.planId).toBe(gold);
        });

        it("applies the downgrade with force and records the overage in the audit", async () => {
            const tenant = tenantOn(gold);
            mockUsage({ members: 120, staff: 21, branches: 1 });
            vi.spyOn(Plan, "findOne").mockResolvedValue(basic);
            const res = mockRes();

            await updateTenantLifecycle(
                { params: { id: String(tenant._id) }, body: { action: "change_plan", newPlanKey: "basic", reason: "Customer asked to downgrade", force: true }, platformUser: adminUser },
                res
            );

            expect(res.status).not.toHaveBeenCalledWith(409);
            expect(tenant.planId).toBe(basic._id);
            expect(tenant.save).toHaveBeenCalled();
            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    meta: expect.objectContaining({
                        afterState: expect.objectContaining({
                            planKey: "basic",
                            overLimits: [expect.objectContaining({ limit: "maxStaff", current: 21, max: 5 })],
                        }),
                    }),
                })
            );
        });

        it("lets a downgrade through when usage already fits", async () => {
            const tenant = tenantOn(gold);
            mockUsage({ members: 50, staff: 4, branches: 1 });
            vi.spyOn(Plan, "findOne").mockResolvedValue(basic);
            const res = mockRes();

            await updateTenantLifecycle(
                { params: { id: String(tenant._id) }, body: { action: "change_plan", newPlanKey: "basic", reason: "Downgrade" }, platformUser: adminUser },
                res
            );

            expect(tenant.planId).toBe(basic._id);
            expect(tenant.save).toHaveBeenCalled();
        });

        it("refuses lowering a limit override below current usage", async () => {
            const tenant = tenantOn(gold);
            mockUsage({ members: 900, staff: 4, branches: 1 });
            const res = mockRes();

            await updateTenantLifecycle(
                {
                    params: { id: String(tenant._id) },
                    body: { action: "change_overrides", reason: "Tighten cap", limitOverrides: { maxMembers: 500, maxStaff: null, maxBranches: null } },
                    platformUser: adminUser,
                },
                res
            );

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json.mock.calls[0][0].details.overages[0]).toMatchObject({ limit: "maxMembers", current: 900, max: 500 });
            expect(tenant.save).not.toHaveBeenCalled();
        });
    });

    describe("manual grant", () => {
        it("asks for confirmation when the granted plan is smaller than current usage", async () => {
            const tenant = { _id: new mongoose.Types.ObjectId(), status: "active", billing: {}, limitOverrides: {}, save: vi.fn() };
            vi.spyOn(Tenant, "findById").mockResolvedValue(tenant);
            vi.spyOn(Plan, "findOne").mockResolvedValue(basic);
            mockUsage({ members: 10, staff: 9, branches: 1 });
            const res = mockRes();

            await issueManualGrant(
                { body: { tenantId: String(tenant._id), planKey: "basic", cycle: "monthly", durationMonths: 1, reason: "Partner grant" }, platformUser: adminUser },
                res
            );

            expect(res.status).toHaveBeenCalledWith(409);
            expect(tenant.save).not.toHaveBeenCalled();
        });

        it("issues the grant with force and notes the overage on the ledger", async () => {
            const tenant = { _id: new mongoose.Types.ObjectId(), status: "active", billing: {}, limitOverrides: {}, save: vi.fn().mockResolvedValue(true) };
            vi.spyOn(Tenant, "findById").mockResolvedValue(tenant);
            vi.spyOn(Plan, "findOne").mockResolvedValue(basic);
            vi.spyOn(BillingEvent, "create").mockResolvedValue({});
            mockUsage({ members: 10, staff: 9, branches: 1 });
            const res = mockRes();

            await issueManualGrant(
                { body: { tenantId: String(tenant._id), planKey: "basic", cycle: "monthly", durationMonths: 1, reason: "Partner grant", force: true }, platformUser: adminUser },
                res
            );

            expect(tenant.save).toHaveBeenCalled();
            expect(BillingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    meta: expect.objectContaining({ overLimits: [expect.objectContaining({ limit: "maxStaff", excess: 4 })] }),
                })
            );
        });
    });
});
