import { describe, it, expect, beforeEach } from "vitest";
import cacheService from "../services/cacheService";
import { cacheResponse, buildCacheKey } from "../middleware/apiCache";
import { invalidateTenantCache, invalidatePlatformCache, autoInvalidate } from "../utils/cacheInvalidator";

describe("API Caching Architecture", () => {
    beforeEach(() => {
        cacheService.clear();
    });

    describe("CacheService Core", () => {
        it("stores and retrieves values with ETag", () => {
            const etag = cacheService.set("key1", JSON.stringify({ hello: "world" }), {
                ttlSeconds: 60,
                tags: ["tag1"],
            });

            expect(etag).toBeDefined();
            expect(etag.startsWith('"')).toBe(true);

            const cached = cacheService.get("key1");
            expect(cached).not.toBeNull();
            expect(JSON.parse(cached.value)).toEqual({ hello: "world" });
            expect(cached.etag).toBe(etag);
        });

        it("expires entries after TTL", async () => {
            cacheService.set("expiringKey", "val", { ttlSeconds: 0.05 });
            expect(cacheService.get("expiringKey")).not.toBeNull();

            await new Promise((res) => setTimeout(res, 60));
            expect(cacheService.get("expiringKey")).toBeNull();
        });

        it("invalidates all entries belonging to a tag", () => {
            cacheService.set("k1", "val1", { tags: ["tenant:t1:members"] });
            cacheService.set("k2", "val2", { tags: ["tenant:t1:members", "tenant:t1:revenue"] });
            cacheService.set("k3", "val3", { tags: ["tenant:t2:members"] });

            expect(cacheService.get("k1")).not.toBeNull();
            expect(cacheService.get("k2")).not.toBeNull();
            expect(cacheService.get("k3")).not.toBeNull();

            // Invalidate t1 members
            const evicted = cacheService.invalidateTags(["tenant:t1:members"]);
            expect(evicted).toBe(2);

            expect(cacheService.get("k1")).toBeNull();
            expect(cacheService.get("k2")).toBeNull();
            // Tenant t2 remains unaffected
            expect(cacheService.get("k3")).not.toBeNull();
        });

        it("enforces maximum cache size with LRU eviction", () => {
            const smallCache = new cacheService.CacheService({ maxSize: 3, defaultTtl: 60 });
            smallCache.set("a", 1);
            smallCache.set("b", 2);
            smallCache.set("c", 3);

            // Access 'a' to mark it as recently used
            smallCache.get("a");

            // Adding 'd' should evict 'b' (oldest unaccessed item)
            smallCache.set("d", 4);

            expect(smallCache.get("b")).toBeNull();
            expect(smallCache.get("a")).not.toBeNull();
            expect(smallCache.get("c")).not.toBeNull();
            expect(smallCache.get("d")).not.toBeNull();
        });
    });

    describe("Multi-Tenant & Role Isolation", () => {
        it("generates isolated cache keys per tenant and role", () => {
            const reqTenantA = {
                baseUrl: "/api/members",
                path: "",
                query: { limit: "20" },
                user: { tenantId: "tenant_aaa", role: "Sales", id: "user_1" },
            };
            const reqTenantB = {
                baseUrl: "/api/members",
                path: "",
                query: { limit: "20" },
                user: { tenantId: "tenant_bbb", role: "Sales", id: "user_2" },
            };

            const keyA = buildCacheKey(reqTenantA, "tenant");
            const keyB = buildCacheKey(reqTenantB, "tenant");

            expect(keyA).not.toEqual(keyB);
            expect(keyA).toContain("tenant:tenant_aaa");
            expect(keyB).toContain("tenant:tenant_bbb");
        });

        it("strictly isolates user-scoped keys for sales/coach reps", () => {
            const reqRep1 = {
                baseUrl: "/api/users",
                path: "/sales-revenue",
                query: {},
                user: { tenantId: "gym_1", role: "Sales", id: "sales_rep_1" },
            };
            const reqRep2 = {
                baseUrl: "/api/users",
                path: "/sales-revenue",
                query: {},
                user: { tenantId: "gym_1", role: "Sales", id: "sales_rep_2" },
            };

            const keyRep1 = buildCacheKey(reqRep1, "user");
            const keyRep2 = buildCacheKey(reqRep2, "user");

            expect(keyRep1).toContain("user:sales_rep_1");
            expect(keyRep2).toContain("user:sales_rep_2");
            expect(keyRep1).not.toEqual(keyRep2);
        });
    });

    describe("Express Middleware: cacheResponse", () => {
        function createMockRes() {
            const headers = {};
            let statusCode = 200;
            return {
                statusCode,
                setHeader(k, v) {
                    headers[k.toLowerCase()] = v;
                },
                getHeader(k) {
                    return headers[k.toLowerCase()];
                },
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                end: function () {},
                send: function (body) {
                    this.body = body;
                    return this;
                },
            };
        }

        it("serves cache MISS on first call and stores body with ETag", () => {
            const middleware = cacheResponse({ ttlSeconds: 60, tags: ["members"] });
            const req = {
                method: "GET",
                baseUrl: "/api/members",
                path: "",
                query: {},
                headers: {},
                user: { tenantId: "t100", role: "Owner" },
            };
            const res = createMockRes();
            let nextCalled = false;

            middleware(req, res, () => {
                nextCalled = true;
            });
            expect(nextCalled).toBe(true);
            expect(res.getHeader("x-cache")).toBe("MISS");

            // Controller finishes and sends payload
            res.send(JSON.stringify({ count: 42 }));
            expect(res.getHeader("etag")).toBeDefined();
            expect(res.getHeader("cache-control")).toContain("max-age=60");

            // Second request: cache HIT
            const res2 = createMockRes();
            let nextCalled2 = false;
            middleware(req, res2, () => {
                nextCalled2 = true;
            });

            expect(nextCalled2).toBe(false); // Short-circuited from cache
            expect(res2.getHeader("x-cache")).toBe("HIT");
            expect(res2.body).toBe(JSON.stringify({ count: 42 }));
        });

        it("returns HTTP 304 Not Modified when client provides matching If-None-Match", () => {
            const middleware = cacheResponse({ ttlSeconds: 60, tags: ["checkins"] });
            const req1 = {
                method: "GET",
                baseUrl: "/api/members",
                path: "/today-checkins",
                query: {},
                headers: {},
                user: { tenantId: "t100", role: "Receptionist" },
            };
            const res1 = createMockRes();
            middleware(req1, res1, () => {});
            res1.send(JSON.stringify({ checkIns: [] }));
            const etag = res1.getHeader("etag");

            // Request with If-None-Match
            const req2 = {
                method: "GET",
                baseUrl: "/api/members",
                path: "/today-checkins",
                query: {},
                headers: { "if-none-match": etag },
                user: { tenantId: "t100", role: "Receptionist" },
            };
            const res2 = createMockRes();
            middleware(req2, res2, () => {});

            expect(res2.statusCode).toBe(304);
            expect(res2.getHeader("x-cache")).toBe("HIT");
            expect(res2.getHeader("etag")).toBe(etag);
        });

        it("bypasses cache when X-Cache-Bypass is present", () => {
            const middleware = cacheResponse({ ttlSeconds: 60 });
            const req = {
                method: "GET",
                baseUrl: "/api/members",
                path: "",
                query: {},
                headers: { "x-cache-bypass": "true" },
                user: { tenantId: "t100", role: "Owner" },
            };
            const res = createMockRes();
            let nextCalled = false;
            middleware(req, res, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
            expect(res.getHeader("x-cache")).toBe("BYPASS");
        });

        it("invalidates cache when autoInvalidate executes", () => {
            const cacheMw = cacheResponse({ ttlSeconds: 60, tags: ["members", "revenue"] });
            const reqGet = {
                method: "GET",
                baseUrl: "/api/members",
                path: "",
                query: {},
                headers: {},
                user: { tenantId: "t200", role: "Owner" },
            };
            const resGet = createMockRes();
            cacheMw(reqGet, resGet, () => {});
            resGet.send(JSON.stringify({ members: ["M1"] }));

            // Verify cached
            const resVerify = createMockRes();
            cacheMw(reqGet, resVerify, () => {});
            expect(resVerify.getHeader("x-cache")).toBe("HIT");

            // Invalidate via helper
            const evicted = invalidateTenantCache("t200", "members");
            expect(evicted).toBeGreaterThan(0);

            // Subsequent get is a MISS
            const resAfter = createMockRes();
            let nextCalled = false;
            cacheMw(reqGet, resAfter, () => {
                nextCalled = true;
            });
            expect(nextCalled).toBe(true);
            expect(resAfter.getHeader("x-cache")).toBe("MISS");
        });
    });
});
