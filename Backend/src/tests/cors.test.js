const http = require("http");

// Set before loading app.js so CORS captures BASE_DOMAIN + www/apex allowlist.
process.env.BASE_DOMAIN = process.env.BASE_DOMAIN || "forma-official.com";
if (!process.env.FRONTEND_ORIGIN) {
    process.env.FRONTEND_ORIGIN = "http://localhost:5173";
}

const app = require("../app");

describe("CORS configuration", () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, "127.0.0.1", () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    it("allows preflight request from Vercel domain with x-tenant-slug and custom headers", async () => {
        const res = await fetch(`${baseUrl}/api/tenant/me`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://leap-dszt.vercel.app",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type, authorization, x-tenant-slug, x-request-id",
            },
        });

        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe("https://leap-dszt.vercel.app");

        const allowHeaders = res.headers.get("access-control-allow-headers") || "";
        const lowerHeaders = allowHeaders.toLowerCase();
        expect(lowerHeaders).toContain("x-tenant-slug");
        expect(lowerHeaders).toContain("authorization");
        expect(lowerHeaders).toContain("content-type");
        expect(lowerHeaders).toContain("x-request-id");
    });

    it("allows preflight request from localhost", async () => {
        const res = await fetch(`${baseUrl}/api/members/all`, {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization, x-tenant-slug",
            },
        });

        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
        const allowHeaders = res.headers.get("access-control-allow-headers") || "";
        expect(allowHeaders.toLowerCase()).toContain("x-tenant-slug");
    });

    it("allows preflight from www under BASE_DOMAIN", async () => {
        const res = await fetch(`${baseUrl}/api/tenant/me`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://www.forma-official.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type, authorization",
            },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe("https://www.forma-official.com");
    });

    it("allows preflight from apex under BASE_DOMAIN", async () => {
        const res = await fetch(`${baseUrl}/api/tenant/me`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://forma-official.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type, authorization",
            },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe("https://forma-official.com");
    });
});
