import { describe, expect, it } from "vitest";
import analyticsRoutes from "../../routes/analyticsRoutes.js";
import { requireAccess } from "../../middleware/accessMiddleware.js";
import { requireFeature } from "../../middleware/featureGating.js";
import { allowAnyFeature } from "../../middleware/accessMiddleware.js";
import { GYM_ROLES } from "./expectedAccess.js";
import { decide, gmAreaBypass, staff } from "./helpers.js";
import { loadRouteCalls } from "./routeScan.js";

function planRequest(role, features) {
    return {
        user: { role, id: "staff-1", tenantId: "tenant-1" },
        tenant: { featureOverrides: { add: [], remove: [] } },
        plan: { features },
        requestId: "req-plan",
    };
}

async function runPlan(feature, features, role = "Owner") {
    let status = null;
    let body = null;
    let passed = false;
    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
    };
    await requireFeature(feature)(planRequest(role, features), res, () => {
        passed = true;
    });
    return { passed, status, body };
}

function runArea(area, user, tenant = null) {
    let status = null;
    let body = null;
    let passed = false;
    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
    };
    requireAccess(area)({ user, tenant }, res, () => {
        passed = true;
    });
    return { passed, status, body };
}

function roleAllowed(call, role) {
    if (call.kind === "allowRoles") {
        return call.roles.includes(role) || gmAreaBypass(role, call.feature);
    }
    return call.features.some((feature) => call.roles.includes(role) || gmAreaBypass(role, feature));
}

function runRoleGate(call, role) {
    if (call.kind === "allowRoles") return decide(call.feature, call.roles, staff(role));
    let status = null;
    let body = null;
    let passed = false;
    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
    };
    allowAnyFeature(call.features, ...call.roles)(
        { user: staff(role), tenant: null, planFeatures: null },
        res,
        () => {
            passed = true;
        }
    );
    return { passed, status, body };
}

describe("Plan features and area gates", () => {
    const calls = loadRouteCalls();
    const planCalls = calls.filter((call) => call.kind === "requireFeature");
    const areaCalls = calls.filter((call) => call.kind === "requireAccess");
    const chained = calls.filter((call) => call.planFeatures?.length);

    it("finds plan and area gates on the routers", () => {
        expect(planCalls.map((call) => call.feature)).toEqual(expect.arrayContaining([
            "members",
            "accounting",
            "packages",
            "whatsapp",
            "sales_crm",
            "checkin",
            "exec_analytics",
        ]));
        expect(areaCalls.map((call) => call.area).sort()).toEqual([
            "accounting",
            "coaching",
            "packages",
            "sales",
            "whatsapp",
        ]);
        expect(chained.length).toBeGreaterThan(5);
    });

    it("allows a plan that includes the feature and blocks one that does not", async () => {
        for (const call of planCalls) {
            const open = await runPlan(call.feature, [call.feature]);
            expect(open.passed, call.where).toBe(true);
            const closed = await runPlan(call.feature, ["members"].filter((key) => key !== call.feature));
            expect(closed.passed, call.where).toBe(false);
            expect(closed.status).toBe(403);
            expect(closed.body.code).toBe("FEATURE_NOT_IN_PLAN");
        }
    });

    it("stops on the role gate before the plan gate can answer", () => {
        const denied = chained.filter((call) => GYM_ROLES.some((role) => !roleAllowed(call, role)));
        expect(denied.length).toBeGreaterThan(0);
        for (const call of denied) {
            const role = GYM_ROLES.find((candidate) => !roleAllowed(call, candidate));
            const result = runRoleGate(call, role);
            expect(result.passed, `${call.where} ${role}`).toBe(false);
            expect(result.status).toBe(403);
            expect(result.body?.code).not.toBe("FEATURE_NOT_IN_PLAN");
        }
    });

    it("lets the owner through every area, keeps legacy roles, and honors a removed checklist area", () => {
        for (const call of areaCalls) {
            expect(runArea(call.area, staff("Owner")).passed, call.where).toBe(true);
            expect(runArea(call.area, staff("Sales")).passed, `${call.where} legacy`).toBe(true);
            const removed = runArea(call.area, staff("General Manager"), {
                roleAccess: { "General Manager": [] },
            });
            expect(removed.passed, call.where).toBe(false);
            expect(removed.status).toBe(403);
            const salesRemoved = runArea(call.area, staff("Sales"), {
                roleAccess: { Sales: [] },
            });
            expect(salesRemoved.passed, call.where).toBe(false);
            expect(salesRemoved.status).toBe(403);
        }
    });

    it("lets a head coach skip the attendance plan check", async () => {
        const next = { called: false };
        const res = { status() { return this; }, json() { return this; } };
        analyticsRoutes.requireAttendancePlan(
            planRequest("Head Coach", []),
            res,
            () => {
                next.called = true;
            }
        );
        expect(next.called).toBe(true);

        for (const role of GYM_ROLES.filter((candidate) => candidate !== "Head Coach")) {
            const closed = { passed: false, status: null, body: null };
            const closedRes = {
                status(code) {
                    closed.status = code;
                    return this;
                },
                json(payload) {
                    closed.body = payload;
                    return this;
                },
            };
            await analyticsRoutes.requireAttendancePlan(planRequest(role, []), closedRes, () => {
                closed.passed = true;
            });
            expect(closed.passed, role).toBe(false);
            expect(closed.status).toBe(403);
            expect(closed.body.code).toBe("FEATURE_NOT_IN_PLAN");

            const open = { passed: false };
            await analyticsRoutes.requireAttendancePlan(
                planRequest(role, ["exec_analytics"]),
                { status() { return this; }, json() { return this; } },
                () => {
                    open.passed = true;
                }
            );
            expect(open.passed, role).toBe(true);
        }
    });
});
