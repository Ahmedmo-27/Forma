import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        headers: {},
        set(key, value) {
            this.headers[key] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
}

describe("getHealth", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("returns 200 when MongoDB is connected", async () => {
        const mongoosePath = require.resolve("mongoose");
        require.cache[mongoosePath] = {
            id: mongoosePath,
            filename: mongoosePath,
            loaded: true,
            exports: { connection: { readyState: 1 } },
        };

        const { getHealth } = require("./healthController");
        const res = mockRes();
        getHealth({}, res);

        expect(res.statusCode).toBe(200);
        expect(res.headers["Cache-Control"]).toBe("no-store");
        expect(res.body).toMatchObject({
            status: "ok",
            database: "connected",
        });
        expect(typeof res.body.uptimeSeconds).toBe("number");
        expect(res.body.timestamp).toEqual(expect.any(String));
    });

    it("returns 503 when MongoDB is not connected", async () => {
        const mongoosePath = require.resolve("mongoose");
        require.cache[mongoosePath] = {
            id: mongoosePath,
            filename: mongoosePath,
            loaded: true,
            exports: { connection: { readyState: 0 } },
        };

        delete require.cache[require.resolve("./healthController")];
        const { getHealth } = require("./healthController");
        const res = mockRes();
        getHealth({}, res);

        expect(res.statusCode).toBe(503);
        expect(res.body).toMatchObject({
            status: "degraded",
            database: "disconnected",
        });
    });
});
