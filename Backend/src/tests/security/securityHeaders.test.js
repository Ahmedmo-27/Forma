/**
 * Phase 2 — API security headers (Helmet) smoke checks.
 */
const http = require("http");

process.env.BASE_DOMAIN = process.env.BASE_DOMAIN || "forma-official.com";
if (!process.env.FRONTEND_ORIGIN) {
    process.env.FRONTEND_ORIGIN = "http://localhost:5173";
}
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "headers_test_jwt_secret_do_not_use_prod";
}
if (!process.env.PLATFORM_JWT_SECRET) {
    process.env.PLATFORM_JWT_SECRET = "headers_test_platform_secret";
}
if (!process.env.TENANT_SECRET_KEY) {
    process.env.TENANT_SECRET_KEY =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

const app = require("../../app");

describe("Security Phase 2: API Helmet headers", () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, "127.0.0.1", () => {
                baseUrl = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    it("sets X-Content-Type-Options nosniff on /health", async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("sets X-DNS-Prefetch-Control / Helmet defaults without enabling CSP on API", async () => {
        const res = await fetch(`${baseUrl}/health`);
        // API intentionally disables CSP (SPA CSP is on Vercel).
        expect(res.headers.get("content-security-policy")).toBeNull();
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("sets Cross-Origin-Resource-Policy to cross-origin for uploads/API", async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    });
});

describe("Security Phase 2: SPA header contract (static config)", () => {
    it("vercel.json denies framing and sets strict CSP script-src", () => {
        const fs = require("fs");
        const path = require("path");
        const root = path.resolve(__dirname, "../../../../vercel.json");
        const cfg = JSON.parse(fs.readFileSync(root, "utf8"));
        const globalHeaders = cfg.headers.find((h) => h.source === "/(.*)")?.headers || [];
        const map = Object.fromEntries(globalHeaders.map((h) => [h.key, h.value]));
        expect(map["X-Frame-Options"]).toBe("DENY");
        expect(map["Content-Security-Policy"]).toContain("script-src 'self'");
        expect(map["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
        expect(map["Strict-Transport-Security"]).toContain("max-age=");
    });
});
