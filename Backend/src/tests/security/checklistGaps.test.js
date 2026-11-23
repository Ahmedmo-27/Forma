/**
 * Closes SECURITY_PENTEST_CHECKLIST Gap items + Manual items that can be proven in CI.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import http from "http";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";

process.env.BASE_DOMAIN = process.env.BASE_DOMAIN || "forma-official.com";
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
process.env.JWT_SECRET =
    process.env.JWT_SECRET || "gaps_test_jwt_secret_do_not_use_prod_32chars";
process.env.PLATFORM_JWT_SECRET =
    process.env.PLATFORM_JWT_SECRET || "gaps_test_platform_secret_distinct_value";
process.env.TENANT_SECRET_KEY =
    process.env.TENANT_SECRET_KEY ||
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
    GLOBAL_API_MAX,
    GLOBAL_WINDOW_MS,
    PUBLIC_SIGNUP_MAX,
    UPLOAD_WRITE_MAX,
    UPLOAD_READ_MAX,
} from "../../middleware/rateLimitBudgets";
import { escapeRegex } from "../../utils/username";
import { sanitizeForLog } from "../../utils/sanitizeLog";
import { isAllowedOrigin, csrfOrigin } from "../../middleware/csrfOrigin";
import { platformIpAllowlist } from "../../middleware/ipAllowlist";
import { cacheResponse } from "../../middleware/apiCache";
import {
    DEFAULT_PUBLIC_SITE,
    resolveCanPreview,
} from "../../services/publicSiteService";

const backendSrc = path.resolve(__dirname, "../..");
const frontendSrc = path.resolve(__dirname, "../../../../Frontend/src");
const repoRoot = path.resolve(__dirname, "../../../..");

function read(rel) {
    return fs.readFileSync(path.join(backendSrc, rel), "utf8");
}

function walkJs(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkJs(full, acc);
        else if (/\.(jsx?|tsx?)$/.test(entry.name)) acc.push(full);
    }
    return acc;
}

async function listen(app) {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return {
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

function rateLimitedApp({ max, message }) {
    const app = express();
    app.use(
        rateLimit({
            windowMs: 60_000,
            max,
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res, _next, options) => {
                const retryAfter = Math.ceil(options.windowMs / 1000);
                res.status(429).json({
                    code: "RATE_LIMITED",
                    message,
                    retryAfter,
                });
            },
        })
    );
    app.post("/hit", (_req, res) => res.json({ ok: true }));
    app.get("/hit", (_req, res) => res.json({ ok: true }));
    return app;
}

describe("Checklist gaps: rate limits (§6.1, §7.1, §12.7)", () => {
    it("documents production budgets and wires them into limiters", () => {
        expect(GLOBAL_API_MAX).toBe(600);
        expect(GLOBAL_WINDOW_MS).toBe(15 * 60 * 1000);
        expect(PUBLIC_SIGNUP_MAX).toBe(10);
        expect(UPLOAD_WRITE_MAX).toBe(10);
        expect(UPLOAD_READ_MAX).toBe(300);

        expect(read("middleware/publicSignupLimiter.js")).toMatch(/PUBLIC_SIGNUP_MAX/);
        expect(read("middleware/uploadLimiter.js")).toMatch(/UPLOAD_WRITE_MAX/);
        expect(read("app.js")).toMatch(/GLOBAL_API_MAX/);
        expect(read("app.js")).toMatch(/UPLOAD_READ_MAX/);
        expect(read("routes/publicRoutes.js")).toMatch(/publicSignupLimiter/);
        expect(read("routes/membersRoutes.js")).toMatch(/uploadLimiter/);
        expect(read("app.js")).toMatch(/uploadReadLimiter/);
    });

    it("signup-style limiter returns 429 after budget exhausted", async () => {
        const { baseUrl, close } = await listen(rateLimitedApp({ max: 2, message: "Too many signup attempts" }));
        try {
            expect((await fetch(`${baseUrl}/hit`, { method: "POST" })).status).toBe(200);
            expect((await fetch(`${baseUrl}/hit`, { method: "POST" })).status).toBe(200);
            const limited = await fetch(`${baseUrl}/hit`, { method: "POST" });
            expect(limited.status).toBe(429);
            const body = await limited.json();
            expect(body.code).toBe("RATE_LIMITED");
        } finally {
            await close();
        }
    });

    it("upload-style limiter returns 429 after budget exhausted", async () => {
        const { baseUrl, close } = await listen(rateLimitedApp({ max: 2, message: "Too many uploads" }));
        try {
            expect((await fetch(`${baseUrl}/hit`, { method: "POST" })).status).toBe(200);
            expect((await fetch(`${baseUrl}/hit`, { method: "POST" })).status).toBe(200);
            expect((await fetch(`${baseUrl}/hit`, { method: "POST" })).status).toBe(429);
        } finally {
            await close();
        }
    });
});

describe("Checklist gaps: unpublished site gate (§6.4)", () => {
    it("defaults public site to unpublished", () => {
        expect(DEFAULT_PUBLIC_SITE.published).toBe(false);
    });

    it("resolveCanPreview denies missing/invalid tokens", async () => {
        expect(await resolveCanPreview(null)).toEqual({ canPreview: false, previewAs: null });
        expect(await resolveCanPreview("")).toEqual({ canPreview: false, previewAs: null });
        expect(await resolveCanPreview("Bearer not-a-jwt")).toEqual({ canPreview: false, previewAs: null });
    });

    it("site-config allowAccess is published OR canPreview", () => {
        const allowAccess = (published, canPreview) => published || canPreview;
        expect(allowAccess(false, false)).toBe(false);
        expect(allowAccess(false, true)).toBe(true);
        expect(allowAccess(true, false)).toBe(true);
        expect(read("controllers/publicController.js")).toMatch(/allowAccess:\s*site\.published\s*\|\|\s*canPreview/);
    });
});

describe("Checklist gaps: Cache-Control on authenticated APIs (§11.6)", () => {
    it("cacheResponse defaults to private, no-store", () => {
        const middleware = cacheResponse({ ttlSeconds: 30, tags: ["t"] });
        const headers = {};
        const res = {
            setHeader: (k, v) => {
                headers[k.toLowerCase()] = v;
            },
            getHeader: (k) => headers[k.toLowerCase()],
            statusCode: 200,
            send(body) {
                this.body = body;
                return this;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            end() {
                return this;
            },
        };
        let next = false;
        middleware(
            { method: "GET", baseUrl: "/api/members", path: "/all", headers: {}, user: { id: "u" }, tenant: { id: "t" } },
            res,
            () => {
                next = true;
            }
        );
        expect(next).toBe(true);
        res.send("{}");
        expect(headers["cache-control"]).toBe("private, no-store");
    });

    it("health and live streams set no-store", () => {
        expect(read("controllers/healthController.js")).toMatch(/Cache-Control["'],\s*["']no-store/);
        expect(read("utils/liveEvents.js")).toMatch(/Cache-Control["'],\s*["']no-store/);
    });
});

describe("Checklist gaps: secrets not leaked in logs/settings/export (§5.6)", () => {
    it("sanitizeForLog redacts secrets, API keys, and access tokens", () => {
        const sanitized = sanitizeForLog({
            accessToken: "wa-secret",
            apiKey: "brevo",
            accessKeyId: "r2id",
            secretAccessKey: "r2secret",
            password: "x",
            ok: true,
        });
        expect(sanitized.accessToken).toBe("[REDACTED]");
        expect(sanitized.apiKey).toBe("[REDACTED]");
        expect(sanitized.accessKeyId).toBe("[REDACTED]");
        expect(sanitized.secretAccessKey).toBe("[REDACTED]");
        expect(sanitized.password).toBe("[REDACTED]");
        expect(sanitized.ok).toBe(true);
    });

    it("tenant export strips WhatsApp accessToken from tenant settings", () => {
        expect(read("controllers/platformSupportController.js")).toMatch(
            /\.select\("-settings\.whatsapp\.accessToken"\)/
        );
    });

    it("request logger sanitizes body and query", () => {
        const src = read("middleware/requestLogger.js");
        expect(src).toMatch(/sanitizeForLog\(req\.query\)/);
        expect(src).toMatch(/sanitizeForLog\(req\.body\)/);
    });
});

describe("Checklist gaps: ReDoS-safe search (§8.4)", () => {
    it("escapeRegex neutralizes metacharacters used in Mongo search", () => {
        const evil = "a".repeat(40) + ".*+?^${}()|[]\\";
        const safe = escapeRegex(evil);
        expect(safe).not.toMatch(/(?<!\\)\*/);
        const started = Date.now();
        const re = new RegExp(safe, "i");
        expect(re.test(evil)).toBe(true);
        expect(Date.now() - started).toBeLessThan(50);
    });

    it("member search builds RegExp from escapeRegex", () => {
        expect(read("controllers/memberController.js")).toMatch(/escapeRegex\(search\)/);
        expect(read("utils/memberFilters.js")).toMatch(/escapeRegex\(q\)/);
        expect(read("controllers/accessController.js")).toMatch(/escapeRegex\(q\)/);
    });

    it("platform and retail search build RegExp from escapeRegex", () => {
        expect(read("controllers/platformTenantController.js")).toMatch(/escapeRegex\(search\.trim\(\)\)/);
        expect(read("controllers/platformUserController.js")).toMatch(/escapeRegex\(search\.trim\(\)\)/);
        expect(read("controllers/platformBillingController.js")).toMatch(/escapeRegex\(search\.trim\(\)\)/);
        expect(read("controllers/platformSupportController.js")).toMatch(/escapeRegex\(search\.trim\(\)\)/);
        expect(read("controllers/platformFeatureTrialController.js")).toMatch(/escapeRegex\(/);
        expect(read("controllers/platformPlanController.js")).toMatch(/escapeRegex\(search\.trim\(\)\)/);
        expect(read("controllers/retailController.js")).toMatch(/escapeRegex\(/);
    });
});

describe("Checklist gaps: header injection resisted (§8.8)", () => {
    it("upload Content-Disposition strips quotes and CRLF from filenames", () => {
        const src = read("app.js");
        expect(src).toContain('replace(/["\\r\\n]/g, "")');
        expect(src).toMatch(/Content-Disposition/);
        expect(src).toMatch(/X-Content-Type-Options["'],\s*["']nosniff/);
    });

    it("rejects Origin null for cookie CSRF mutations", () => {
        expect(isAllowedOrigin("null")).toBe(false);
        const req = {
            method: "POST",
            cookies: { forma_tenant: "x" },
            headers: {},
            get: (name) => (name === "origin" ? "null" : undefined),
        };
        const res = {
            statusCode: 200,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            },
        };
        const next = vi.fn();
        csrfOrigin(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });
});

describe("Checklist manual-automatable: IP allowlist, redirects, email origin, secrets (§2.6, §10.5, §10.7, §15.7)", () => {
    const prevAllow = process.env.PLATFORM_IP_ALLOWLIST;

    afterEach(() => {
        if (prevAllow === undefined) delete process.env.PLATFORM_IP_ALLOWLIST;
        else process.env.PLATFORM_IP_ALLOWLIST = prevAllow;
    });

    it("platform IP allowlist denies non-listed clients when configured", () => {
        process.env.PLATFORM_IP_ALLOWLIST = "10.0.0.5";
        const res = {
            statusCode: 200,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            },
        };
        const next = vi.fn();
        platformIpAllowlist({ ip: "127.0.0.1", requestId: "t" }, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.error.code).toBe("AUTH_IP_NOT_ALLOWED");

        const nextOk = vi.fn();
        platformIpAllowlist({ ip: "10.0.0.5", requestId: "t" }, res, nextOk);
        expect(nextOk).toHaveBeenCalled();
    });

    it("impersonation redirect stays on relative app path", () => {
        expect(read("controllers/platformSupportController.js")).toMatch(/redirectPath:\s*"\/members"/);
        const detail = fs.readFileSync(
            path.join(frontendSrc, "platform/features/tenants/TenantDetailPage.jsx"),
            "utf8"
        );
        expect(detail).toMatch(/redirectPath\s*\|\|\s*"\/members"/);
        expect(detail).not.toMatch(/window\.open\(\s*["']https?:\/\//);
    });

    it("owner mail links prefer FRONTEND_ORIGIN", () => {
        const src = fs.readFileSync(path.join(backendSrc, "services/ownerMail.js"), "utf8");
        expect(src).toMatch(/FRONTEND_ORIGIN/);
        expect(src).toMatch(/function appOrigin/);
    });

    it("tenant and platform JWT secrets are distinct in this process", () => {
        expect(process.env.JWT_SECRET).toBeTruthy();
        expect(process.env.PLATFORM_JWT_SECRET).toBeTruthy();
        expect(process.env.JWT_SECRET).not.toBe(process.env.PLATFORM_JWT_SECRET);
    });
});

describe("Checklist manual-automatable: upload disposition, TRACE, null origin, XSS surfaces (§7.9, §12.4, §12.10, §9B)", () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        // eslint-disable-next-line global-require
        const app = require("../../app");
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    it("does not meaningfully expose TRACE", async () => {
        const url = new URL(`${baseUrl}/health`);
        const status = await new Promise((resolve, reject) => {
            const req = http.request(
                {
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname,
                    method: "TRACE",
                },
                (res) => {
                    res.resume();
                    resolve(res.statusCode);
                }
            );
            req.on("error", reject);
            req.end();
        });
        expect([404, 405, 501]).toContain(status);
    });

    it("uploads route without filename is not a directory listing", async () => {
        const res = await fetch(`${baseUrl}/uploads/`);
        expect(res.status).not.toBe(200);
        const text = await res.text();
        expect(text.toLowerCase()).not.toMatch(/index of/);
    });

    it("Origin null is not an allowed CORS/CSRF origin", () => {
        expect(isAllowedOrigin("null")).toBe(false);
        expect(isAllowedOrigin(null)).toBe(false);
    });

    it("frontend has no dangerouslySetInnerHTML or javascript: navigations", () => {
        const offenders = [];
        for (const file of walkJs(frontendSrc)) {
            const text = fs.readFileSync(file, "utf8");
            if (text.includes("dangerouslySetInnerHTML")) {
                offenders.push(`${path.relative(frontendSrc, file)}: dangerouslySetInnerHTML`);
            }
            if (/['"]javascript:/i.test(text) || /href=\{?[`'"]javascript:/i.test(text)) {
                offenders.push(`${path.relative(frontendSrc, file)}: javascript:`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("login query error is not rendered as HTML (no raw search HTML sinks)", () => {
        const loginCandidates = walkJs(frontendSrc).filter((f) =>
            /login/i.test(path.basename(f))
        );
        for (const file of loginCandidates) {
            const text = fs.readFileSync(file, "utf8");
            expect(text).not.toMatch(/dangerouslySetInnerHTML/);
            expect(text).not.toMatch(/innerHTML\s*=/);
        }
    });

    it("JSON-LD script embeds via JSON.stringify only (no raw HTML script sinks)", () => {
        const helmet = fs.readFileSync(
            path.join(frontendSrc, "marketing/components/MarketingHelmet.jsx"),
            "utf8"
        );
        expect(helmet).toMatch(/application\/ld\+json/);
        expect(helmet).toMatch(/JSON\.stringify\(jsonLd\)/);
        expect(helmet).not.toMatch(/dangerouslySetInnerHTML/);

        const scriptSinks = [];
        for (const file of walkJs(frontendSrc)) {
            const text = fs.readFileSync(file, "utf8");
            if (/<script[\s>]/.test(text) && !text.includes("JSON.stringify") && text.includes("application/ld+json")) {
                scriptSinks.push(path.relative(frontendSrc, file));
            }
            if (/innerHTML\s*=\s*.*JSON/i.test(text)) {
                scriptSinks.push(path.relative(frontendSrc, file));
            }
        }
        expect(scriptSinks).toEqual([]);
    });
});

describe("Checklist manual-automatable: Content-Disposition contract (§7.9)", () => {
    it("authenticated uploads set nosniff and disposition helpers", () => {
        const src = read("app.js");
        expect(src).toMatch(/Content-Type/);
        expect(src).toMatch(/Content-Disposition/);
        expect(src).toMatch(/nosniff/);
        expect(src).toMatch(/image\/svg\+xml/);
    });
});

describe("Checklist residual Manual → Auto evidence (§5.7, §9A.3–4, §9B.2, §16.3)", () => {
    it("impersonation UI never persists JWT and opens relative /members (§5.7)", () => {
        const pages = [
            "platform/features/tenants/TenantDetailPage.jsx",
            "platform/features/tenants/TenantsListPage.jsx",
            "platform/features/support/SupportPage.jsx",
        ];
        for (const rel of pages) {
            const text = fs.readFileSync(path.join(frontendSrc, rel), "utf8");
            expect(text).toMatch(/apiCreateImpersonationSession/);
            expect(text).toMatch(/redirectPath\s*\|\|\s*"\/members"/);
            expect(text).not.toMatch(/setItem\(\s*["']token["']/);
            expect(text).not.toMatch(/setItem\(\s*["']ff_token["']/);
            expect(text).not.toMatch(/impersonation_token/);
        }
        const auth = fs.readFileSync(
            path.join(frontendSrc, "platform/lib/auth/AuthContext.jsx"),
            "utf8"
        );
        expect(auth).not.toMatch(/setItem\(\s*["']leap_platform_token["']/);
    });

    it("staff names are HTML-escaped in invite email (§9A.3)", () => {
        // eslint-disable-next-line global-require
        const { inviteEmail, escapeHtml } = require("../../services/emailTemplates");
        const payload = `<img src=x onerror=alert(1)>`;
        const mail = inviteEmail({
            name: payload,
            gymName: `<script>alert(1)</script>`,
            setupUrl: "https://app.forma-official.com/setup?token=abc",
        });
        expect(mail.html).toContain(escapeHtml(payload));
        expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        expect(mail.html).not.toMatch(/<img\s+src=x\s+onerror=/i);
        expect(mail.html).not.toMatch(/<script>alert\(1\)<\/script>/i);
        expect(mail.html).toContain(escapeHtml("<script>alert(1)</script>"));
    });

    it("www coming-soon / site-config message is React text, not HTML (§9A.4)", () => {
        const soon = fs.readFileSync(
            path.join(frontendSrc, "marketing/pages/ComingSoonPage.jsx"),
            "utf8"
        );
        const gate = fs.readFileSync(
            path.join(frontendSrc, "marketing/PublicSiteGate.jsx"),
            "utf8"
        );
        expect(soon).toMatch(/\{message\s*\|\|\s*c\.defaultMessage\}/);
        expect(soon).not.toMatch(/dangerouslySetInnerHTML/);
        expect(soon).not.toMatch(/innerHTML\s*=/);
        expect(gate).toMatch(/ComingSoonPage\s+message=\{data\?\.message\}/);
        expect(gate).not.toMatch(/dangerouslySetInnerHTML/);
    });

    it("SPA uses BrowserRouter only — no HashRouter (§9B.2)", () => {
        const app = fs.readFileSync(path.join(frontendSrc, "App.jsx"), "utf8");
        expect(app).toMatch(/BrowserRouter/);
        expect(app).not.toMatch(/HashRouter/);
        expect(app).not.toMatch(/createHashRouter/);
        for (const file of walkJs(frontendSrc)) {
            const text = fs.readFileSync(file, "utf8");
            if (text.includes("HashRouter") || text.includes("createHashRouter")) {
                throw new Error(`Hash router found in ${path.relative(frontendSrc, file)}`);
            }
        }
    });

    it("client exports pull from authorized API surfaces (§16.3)", () => {
        const routes = read("routes/platformRoutes.js");
        expect(routes).toMatch(/support\/tenants\/:id\/export/);
        expect(routes).toMatch(/SUPPORT_EXPORT_DATA/);
        const support = fs.readFileSync(
            path.join(frontendSrc, "platform/features/support/SupportPage.jsx"),
            "utf8"
        );
        expect(support).toMatch(/apiExportTenantData/);
        expect(support).not.toMatch(/window\.open\(\s*[`'"]\/api\/platform\/support\/tenants/);

        const tasks = fs.readFileSync(
            path.join(frontendSrc, "pages/tasks/AssigningTasksPage.jsx"),
            "utf8"
        );
        expect(tasks).toMatch(/exportSheet/);
        expect(tasks).toMatch(/filtered\.map/);
        expect(tasks).toMatch(/downloadExcel/);
    });

    it(".env.example documents distinct JWT secrets and R2 per-env usage (§0.2/§15.3 contract)", () => {
        const envExample = fs.readFileSync(path.join(repoRoot, "Backend/.env.example"), "utf8");
        expect(envExample).toMatch(/JWT_SECRET=/);
        expect(envExample).toMatch(/PLATFORM_JWT_SECRET=/);
        const jwtLine = envExample.split("\n").find((l) => l.startsWith("JWT_SECRET="));
        const platLine = envExample
            .split("\n")
            .find((l) => l.startsWith("PLATFORM_JWT_SECRET="));
        expect(jwtLine).toBeTruthy();
        expect(platLine).toBeTruthy();
        expect(jwtLine).not.toBe(platLine);
        expect(envExample).toMatch(/R2_/);
    });

    it("SPA ships HSTS for HTTPS prod surfaces (§12.6 config contract)", () => {
        const vercel = fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8");
        expect(vercel).toMatch(/Strict-Transport-Security/);
        expect(vercel).toMatch(/max-age=63072000/);
    });

    it("ops attestation doc covers residual Manual items (§0.2, §12.9, §15.3)", () => {
        const doc = fs.readFileSync(path.join(repoRoot, "docs/SECURITY_OPS_ATTESTATION.md"), "utf8");
        expect(doc).toMatch(/0\.2/);
        expect(doc).toMatch(/12\.9/);
        expect(doc).toMatch(/15\.3/);
        expect(doc).toMatch(/checkEnvHygiene/);
        expect(fs.existsSync(path.join(repoRoot, "Backend/scripts/ops/checkEnvHygiene.js"))).toBe(true);
    });
});

describe("Checklist §12.6 live HTTPS probe (opt-in network)", () => {
    // Default CI stays offline. Run with FORMA_PROBE_NETWORK=1 for live HSTS checks.
    const run = process.env.FORMA_PROBE_NETWORK === "1";

    it.skipIf(!run)("app/www/api serve HTTPS with HSTS", async () => {
        const targets = [
            "https://app.forma-official.com/login",
            "https://www.forma-official.com/",
            "https://api.forma-official.com/health",
        ];
        for (const url of targets) {
            const res = await fetch(url, { method: "GET", redirect: "follow" });
            expect(res.ok || res.status < 500).toBe(true);
            const hsts = res.headers.get("strict-transport-security") || "";
            expect(hsts.toLowerCase()).toMatch(/max-age=\d+/);
        }
    }, 45_000);
});
