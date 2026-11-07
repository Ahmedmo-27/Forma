import { beforeAll, describe, expect, it, vi } from "vitest";

const userController = require("../controllers/userController");

vi.spyOn(userController, "getSalesManagerRevenue").mockImplementation((_req, res) => {
    res.status(200).json({ reached: true });
});

const userRoutes = require("../routes/userRoutes");

function revenueHandlers() {
    const layer = userRoutes.stack.find((entry) => entry.route?.path === "/sales-manager/revenue" && entry.route.methods.get);
    return layer.route.stack.map((entry) => entry.handle);
}

async function dispatch({ role, features }) {
    const req = {
        method: "GET",
        headers: { "cache-control": "no-cache" },
        user: { id: "user-1", role, tenantId: "tenant-1" },
        tenant: { featureOverrides: { add: [], remove: [] } },
        plan: { key: "gold", features },
    };
    const res = {
        ended: false,
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; this.ended = true; return this; },
        setHeader() { return this; },
        getHeader() { return undefined; },
    };

    for (const handler of revenueHandlers()) {
        if (res.ended) break;
        await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (err) => {
                if (settled) return;
                settled = true;
                if (err) reject(err);
                else resolve();
            };
            try {
                Promise.resolve(handler(req, res, finish)).then(() => {
                    if (res.ended) finish();
                }).catch(finish);
            } catch (err) {
                finish(err);
            }
        });
    }
    return res;
}

describe("sales manager revenue feature gate", () => {
    beforeAll(() => {
        expect(revenueHandlers().length).toBeGreaterThan(1);
    });

    it("opens the report for a Gold gym with accounting and without executive analytics", async () => {
        const res = await dispatch({ role: "Owner", features: ["accounting"] });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ reached: true });
    });

    it("blocks the report when the plan only has the old executive analytics feature", async () => {
        const res = await dispatch({ role: "Accountant", features: ["exec_analytics"] });
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe("FEATURE_NOT_IN_PLAN");
        expect(res.body.feature).toBe("accounting");
    });

    it("blocks a sales rep before the feature check", async () => {
        const calls = userController.getSalesManagerRevenue.mock.calls.length;
        const res = await dispatch({ role: "Sales", features: ["accounting", "exec_analytics"] });
        expect(res.statusCode).toBe(403);
        expect(res.body.feature).toBe("reports");
        expect(userController.getSalesManagerRevenue.mock.calls.length).toBe(calls);
    });
});
