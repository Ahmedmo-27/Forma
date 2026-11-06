import { describe, it, expect, vi, afterEach } from "vitest";
import { requireFeature } from "./featureGating";
import { enforceSubscriptionStatus } from "./tenantStatus";
import { sanitizeTenantResponse } from "../controllers/tenantController";
import Tenant from "../models/Tenant";

describe("Phase 4: Feature Gating, Limits & Subscription State", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("requireFeature middleware", () => {
        it("allows request when feature is included in plan", async () => {
            const req = {
                user: { tenantId: "tenant-1" },
                tenant: {
                    featureOverrides: { add: [], remove: [] },
                },
                plan: {
                    features: ["members", "whatsapp", "accounting"],
                },
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            const middleware = requireFeature("whatsapp");
            await middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it("returns 403 FEATURE_NOT_IN_PLAN when feature is not in plan", async () => {
            const req = {
                user: { tenantId: "tenant-1" },
                tenant: {
                    featureOverrides: { add: [], remove: [] },
                },
                plan: {
                    features: ["members", "checkin"],
                },
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            const middleware = requireFeature("accounting");
            await middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: "FEATURE_NOT_IN_PLAN",
                    feature: "accounting",
                })
            );
        });

        it("allows a platinum feature when auth attached the tenant without its plan", async () => {
            const tenantDoc = {
                billing: {
                    cycle: "lifetime",
                    lifetime: { entitlementPolicy: "follow_tier", featureSnapshot: [] },
                },
                featureOverrides: { add: [], remove: [] },
                planId: {
                    key: "platinum",
                    name: "Platinum Plan",
                    features: ["members", "exec_analytics"],
                },
            };
            const populate = vi.fn().mockResolvedValue(tenantDoc);
            vi.spyOn(Tenant, "findById").mockReturnValue({ populate });

            const req = {
                user: { tenantId: "tenant-leap" },
                tenant: {
                    featureOverrides: { add: [], remove: [] },
                    billing: { cycle: "lifetime", lifetime: { entitlementPolicy: "follow_tier" } },
                },
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            await requireFeature("exec_analytics")(req, res, next);

            expect(populate).toHaveBeenCalledWith("planId");
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it("allows feature enabled via tenant featureOverrides.add", async () => {
            const req = {
                user: { tenantId: "tenant-1" },
                tenant: {
                    featureOverrides: { add: ["whatsapp"], remove: [] },
                },
                plan: {
                    features: ["members"],
                },
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            const middleware = requireFeature("whatsapp");
            await middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });

    describe("enforceSubscriptionStatus middleware", () => {
        it("blocks requests when tenant status is suspended", async () => {
            const req = {
                user: { tenantId: "tenant-1" },
                tenant: { status: "suspended" },
                method: "GET",
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            await enforceSubscriptionStatus(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: "TENANT_SUSPENDED" })
            );
        });

        it("allows GET but blocks mutations when past_due", async () => {
            const reqGet = {
                user: { tenantId: "tenant-1" },
                tenant: { status: "past_due" },
                method: "GET",
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            await enforceSubscriptionStatus(reqGet, res, next);
            expect(next).toHaveBeenCalled();

            const reqPost = {
                user: { tenantId: "tenant-1" },
                tenant: { status: "past_due" },
                method: "POST",
            };
            const nextPost = vi.fn();
            await enforceSubscriptionStatus(reqPost, res, nextPost);

            expect(nextPost).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ code: "SUBSCRIPTION_PAST_DUE" })
            );
        });
    });

    describe("sanitizeTenantResponse", () => {
        it("never returns raw secrets or accessToken in response", () => {
            const tenant = {
                _id: "tenant-123",
                name: "Alpha Gym",
                slug: "alpha-gym",
                status: "active",
                settings: {
                    whatsapp: {
                        phoneNumberId: "123456",
                        businessAccountId: "78910",
                        accessToken: "super_secret_encrypted_token",
                    },
                },
            };
            const plan = {
                key: "platinum",
                features: ["members", "whatsapp"],
            };

            const sanitized = sanitizeTenantResponse(tenant, plan);
            expect(sanitized.settings.whatsapp.hasAccessToken).toBe(true);
            expect(sanitized.settings.whatsapp.accessToken).toBeUndefined();
        });
    });
});
