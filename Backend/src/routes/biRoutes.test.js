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
        const plan = req.header("x-plan") || "basic";
        const features = {
            basic: ["members", "checkin", "pt_tracking"],
            gold: ["members", "checkin", "pt_tracking", "accounting", "sales_crm", "funnels"],
            platinum: ["members", "checkin", "pt_tracking", "accounting", "sales_crm", "funnels", "exec_analytics", "business_intelligence"],
        }[plan];
        req.user = { id: "user-1", role: req.header("x-role") || "Owner", tenantId: "tenant-1" };
        req.tenant = { featureOverrides: { add: [], remove: [] }, settings: { locale: { timezone: "Africa/Cairo" } } };
        req.plan = { key: plan, features };
        next();
    },
});

installStub("../middleware/tenantStatus", {
    enforceSubscriptionStatus: (_req, _res, next) => next(),
});

installStub("../controllers/biController", {
    getDashboard: (_req, res) => res.json({ ok: true, report: "dashboard" }),
    getCohorts: (_req, res) => res.json({ ok: true, report: "cohorts" }),
    getHeatmap: (_req, res) => res.json({ ok: true, report: "heatmap" }),
    getForecast: (_req, res) => res.json({ ok: true, report: "forecast" }),
    getFunnel: (_req, res) => res.json({ ok: true, report: "funnel" }),
    getInsights: (_req, res) => res.json({ ok: true, report: "insights" }),
    dismissInsight: (_req, res) => res.json({ ok: true }),
    listObjectives: (_req, res) => res.json({ ok: true, report: "objectives" }),
    suggestObjectives: (_req, res) => res.json({ ok: true }),
    createObjective: (_req, res) => res.json({ ok: true }),
    updateObjective: (_req, res) => res.json({ ok: true }),
    insightToObjective: (_req, res) => res.json({ ok: true }),
    exportMetric: (_req, res) => res.json({ ok: true, report: "export" }),
    rebuild: (_req, res) => res.json({ ok: true }),
});

delete require.cache[require.resolve("./biRoutes")];
const biRoutes = require("./biRoutes");

const GATED = [
    ["/api/bi/cohorts", "basic", "exec_analytics"],
    ["/api/bi/heatmap", "gold", "exec_analytics"],
    ["/api/bi/forecast", "gold", "exec_analytics"],
    ["/api/bi/funnel", "basic", "funnels"],
    ["/api/bi/insights", "gold", "business_intelligence"],
    ["/api/bi/objectives", "gold", "business_intelligence"],
    ["/api/bi/export?metric=newJoins", "gold", "business_intelligence"],
];

describe("bi routes feature gates", () => {
    let server;

    beforeAll(async () => {
        const app = express();
        app.use("/api/bi", biRoutes);
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

    async function get(path, plan, role = "Owner") {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            headers: { "x-plan": plan, "x-role": role },
        });
        const body = await response.json();
        return { status: response.status, body };
    }

    it.each(GATED)("%s is blocked on %s", async (path, plan) => {
        const result = await get(path, plan);
        expect(result.status).toBe(403);
        expect(result.body.code || result.body.error?.code).toBe("FEATURE_NOT_IN_PLAN");
    });

    it("lets a gold gym open the funnel and blocks a receptionist from cohorts", async () => {
        const funnel = await get("/api/bi/funnel", "gold", "Sales Manager");
        expect(funnel.status).toBe(200);
        expect(funnel.body.report).toBe("funnel");
        const cohorts = await get("/api/bi/cohorts", "platinum", "Receptionist");
        expect(cohorts.status).toBe(403);
    });

    it("lets basic open the dashboard", async () => {
        const dash = await get("/api/bi/dashboard", "basic", "Owner");
        expect(dash.status).toBe(200);
        expect(dash.body.report).toBe("dashboard");
    });
});
