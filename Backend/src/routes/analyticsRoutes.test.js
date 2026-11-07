import { createRequire } from "node:module";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

function installStub(specifier, exports) {
    const resolved = require.resolve(specifier);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports,
    };
}

installStub("../middleware/authMiddleware", {
    protect: (req, _res, next) => {
        const platinum = req.header("x-plan") === "platinum";
        req.user = { id: "user-1", role: "Owner", tenantId: "tenant-1" };
        req.tenant = { featureOverrides: { add: [], remove: [] } };
        req.plan = {
            key: platinum ? "platinum" : "gold",
            features: platinum
                ? ["members", "exec_analytics", "funnels", "business_intelligence"]
                : ["members", "accounting", "sales_crm"],
        };
        next();
    },
    authorizeRoles: () => (_req, _res, next) => next(),
});

installStub("../middleware/tenantStatus", {
    enforceSubscriptionStatus: (_req, _res, next) => next(),
});

installStub("../services/gymAnalyticsService", {
    getChurn: async () => ({ ok: true, report: "churn" }),
    getForecast: async () => ({ ok: true, report: "forecast" }),
    getCohorts: async () => ({ ok: true, report: "cohorts" }),
    getAttendance: async () => ({ ok: true, report: "attendance" }),
    getFunnel: async () => ({ ok: true, report: "funnel" }),
    getExecutive: async () => ({ ok: true, report: "executive" }),
});

delete require.cache[require.resolve("../controllers/gymAnalyticsController")];
delete require.cache[require.resolve("./analyticsRoutes")];

const analyticsRoutes = require("./analyticsRoutes");

const ENDPOINTS = [
    ["/api/analytics/churn", "exec_analytics", "churn"],
    ["/api/analytics/forecast", "exec_analytics", "forecast"],
    ["/api/analytics/cohorts", "exec_analytics", "cohorts"],
    ["/api/analytics/attendance", "exec_analytics", "attendance"],
    ["/api/analytics/funnel", "funnels", "funnel"],
    ["/api/analytics/executive", "business_intelligence", "executive"],
];

describe("analytics routes feature gates", () => {
    let server;

    beforeAll(async () => {
        const app = express();
        app.use("/api/analytics", analyticsRoutes);
        server = await new Promise((resolve) => {
            const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
        });
    });

    afterAll(async () => {
        if (!server) return;
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    });

    async function get(path, plan) {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            headers: {
                "x-plan": plan,
                "cache-control": "no-cache",
            },
        });
        const body = await response.json();
        return { status: response.status, body };
    }

    it("returns 403 for every analytics endpoint on a gold plan", async () => {
        for (const [path, feature] of ENDPOINTS) {
            const res = await get(path, "gold");
            expect(res.status, path).toBe(403);
            expect(res.body.code).toBe("FEATURE_NOT_IN_PLAN");
            expect(res.body.feature).toBe(feature);
        }
    });

    it("reaches the controller for every analytics endpoint on platinum", async () => {
        for (const [path, , report] of ENDPOINTS) {
            const res = await get(path, "platinum");
            expect(res.status, path).toBe(200);
            expect(res.body).toEqual({ ok: true, report });
        }
    });
});
