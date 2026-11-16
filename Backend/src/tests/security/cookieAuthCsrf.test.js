/**
 * Cookie session helpers + CSRF Origin guard for cookie-authenticated mutations.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    TENANT_COOKIE,
    PLATFORM_COOKIE,
    setTenantAuthCookie,
    clearTenantAuthCookie,
    setPlatformAuthCookies,
    clearPlatformAuthCookies,
    readTenantToken,
    readPlatformToken,
    requestUsesCookieAuth,
    normalizeBaseDomain,
    looksLikeJwt,
} from "../../utils/authCookies";
import { csrfOrigin, isAllowedOrigin } from "../../middleware/csrfOrigin";

const SAMPLE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature";

function mockRes() {
    const cookies = {};
    const cleared = [];
    return {
        cookies,
        cleared,
        cookie: (name, value, options) => {
            cookies[name] = { value, options };
        },
        clearCookie: (name, options) => {
            cleared.push({ name, options });
            delete cookies[name];
        },
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
}

describe("authCookies", () => {
    const prevEnv = { ...process.env };

    afterEach(() => {
        process.env.NODE_ENV = prevEnv.NODE_ENV;
        process.env.BASE_DOMAIN = prevEnv.BASE_DOMAIN;
    });

    it("sets httpOnly tenant cookie and clears it", () => {
        process.env.NODE_ENV = "development";
        delete process.env.BASE_DOMAIN;
        const res = mockRes();
        setTenantAuthCookie(res, "tenant.jwt");
        expect(res.cookies[TENANT_COOKIE].value).toBe("tenant.jwt");
        expect(res.cookies[TENANT_COOKIE].options.httpOnly).toBe(true);
        expect(res.cookies[TENANT_COOKIE].options.sameSite).toBe("lax");
        expect(res.cookies[TENANT_COOKIE].options.secure).toBe(false);
        expect(res.cookies[TENANT_COOKIE].options.domain).toBeUndefined();

        clearTenantAuthCookie(res);
        expect(res.cleared.some((c) => c.name === TENANT_COOKIE)).toBe(true);
    });

    it("sets Secure + Domain in production when BASE_DOMAIN is set", () => {
        process.env.NODE_ENV = "production";
        process.env.BASE_DOMAIN = "forma-official.com";
        const res = mockRes();
        setPlatformAuthCookies(res, { token: "access", refreshToken: "refresh" });
        expect(res.cookies[PLATFORM_COOKIE].options.secure).toBe(true);
        expect(res.cookies[PLATFORM_COOKIE].options.domain).toBe(".forma-official.com");
        clearPlatformAuthCookies(res);
        expect(res.cleared.map((c) => c.name)).toEqual(
            expect.arrayContaining(["forma_platform", "forma_platform_refresh"])
        );
    });

    it("prefers Bearer over cookie when both present", () => {
        const req = {
            headers: { authorization: `Bearer ${SAMPLE_JWT}` },
            cookies: { [TENANT_COOKIE]: "not-a-jwt" },
        };
        expect(readTenantToken(req)).toBe(SAMPLE_JWT);
        expect(requestUsesCookieAuth(req)).toBe(false);
        expect(readPlatformToken({ headers: {}, cookies: { [PLATFORM_COOKIE]: "a.b.c" } })).toBe("a.b.c");
    });

    it("prefers a JWT-shaped cookie over a malformed Bearer", () => {
        const req = {
            headers: {
                authorization: "Bearer null",
                cookie: `${TENANT_COOKIE}=${SAMPLE_JWT}`,
            },
            cookies: { [TENANT_COOKIE]: SAMPLE_JWT },
        };
        expect(readTenantToken(req)).toBe(SAMPLE_JWT);
        expect(looksLikeJwt(readTenantToken(req))).toBe(true);
    });

    it("prefers a JWT among duplicate forma_tenant cookies", () => {
        const req = {
            headers: {
                cookie: `${TENANT_COOKIE}=; ${TENANT_COOKIE}=garbage; ${TENANT_COOKIE}=${SAMPLE_JWT}`,
            },
            cookies: { [TENANT_COOKIE]: "garbage" },
        };
        expect(readTenantToken(req)).toBe(SAMPLE_JWT);
    });

    it("clears host-only and Domain cookie variants in production", () => {
        process.env.NODE_ENV = "production";
        process.env.BASE_DOMAIN = "https://forma-official.com";
        expect(normalizeBaseDomain(process.env.BASE_DOMAIN)).toBe("forma-official.com");

        const res = mockRes();
        setTenantAuthCookie(res, SAMPLE_JWT);
        expect(res.cookies[TENANT_COOKIE].value).toBe(SAMPLE_JWT);
        expect(res.cookies[TENANT_COOKIE].options.domain).toBe(".forma-official.com");

        const tenantClears = res.cleared.filter((c) => c.name === TENANT_COOKIE);
        expect(tenantClears.some((c) => !c.options.domain)).toBe(true);
        expect(tenantClears.some((c) => c.options.domain === ".forma-official.com")).toBe(true);
    });
});

describe("csrfOrigin", () => {
    const prevOrigin = process.env.FRONTEND_ORIGIN;

    beforeEach(() => {
        process.env.FRONTEND_ORIGIN = "http://localhost:5173";
    });

    afterEach(() => {
        process.env.FRONTEND_ORIGIN = prevOrigin;
    });

    it("allows known origins", () => {
        expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
        expect(isAllowedOrigin("https://evil.example")).toBe(false);
    });

    it("skips CSRF when Bearer is used", () => {
        const req = {
            method: "POST",
            cookies: { [TENANT_COOKIE]: "x" },
            headers: { authorization: "Bearer x" },
            get: () => "https://evil.example",
        };
        const res = mockRes();
        const next = vi.fn();
        csrfOrigin(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
    });

    it("denies cookie mutations from disallowed Origin", () => {
        const req = {
            method: "POST",
            cookies: { [TENANT_COOKIE]: "x" },
            headers: {},
            get: (name) => (name === "origin" ? "https://evil.example" : undefined),
        };
        const res = mockRes();
        const next = vi.fn();
        csrfOrigin(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe("CSRF_ORIGIN_DENIED");
    });

    it("allows cookie mutations from allowlisted Origin", () => {
        const req = {
            method: "DELETE",
            cookies: { [TENANT_COOKIE]: "x" },
            headers: {},
            get: (name) => (name === "origin" ? "http://localhost:5173" : undefined),
        };
        const res = mockRes();
        const next = vi.fn();
        csrfOrigin(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
