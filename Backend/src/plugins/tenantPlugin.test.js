import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";

const tenantPlugin = require("./tenantPlugin");
const {
    runWithTenant,
    runAsPlatform,
    getTenantId,
    isPlatformContext,
} = require("../context/tenantContext");

describe("Phase 2: Tenant Context & Mongoose Plugin", () => {
    const testSchema = new mongoose.Schema({
        name: String,
        email: String,
    });
    testSchema.plugin(tenantPlugin);
    const TestModel = mongoose.models.TestTenantItem || mongoose.model("TestTenantItem", testSchema);

    const findHook = testSchema.s.hooks._pres.get("find")[0].fn;
    const aggregateHook = testSchema.s.hooks._pres.get("aggregate")[0].fn;
    const insertManyHook = testSchema.s.hooks._pres.get("insertMany")[0].fn;

    describe("tenantContext AsyncLocalStorage", () => {
        it("maintains tenantId in runWithTenant callback", () => {
            const tenantId = new mongoose.Types.ObjectId().toString();
            runWithTenant({ tenantId, tenantSlug: "gym-alpha" }, () => {
                expect(getTenantId()).toBe(tenantId);
                expect(isPlatformContext()).toBe(false);
            });
            expect(getTenantId()).toBeNull();
        });

        it("maintains isPlatform in runAsPlatform callback", () => {
            runAsPlatform(() => {
                expect(isPlatformContext()).toBe(true);
                expect(getTenantId()).toBeNull();
            });
            expect(isPlatformContext()).toBe(false);
        });
    });

    describe("tenantPlugin Query Scoping Hook", () => {
        it("throws TenantContextMissingError if find is called without context", () => {
            const mockQuery = { where: vi.fn() };
            expect(() => {
                findHook.call(mockQuery);
            }).toThrow(/TenantContextMissingError/);
        });

        it("auto-injects tenantId into query filter when running with tenant", () => {
            const tenantId = new mongoose.Types.ObjectId().toString();
            const mockQuery = { where: vi.fn() };
            runWithTenant({ tenantId }, () => {
                findHook.call(mockQuery);
            });
            expect(mockQuery.where).toHaveBeenCalledWith({
                tenantId: new mongoose.Types.ObjectId(tenantId),
            });
        });

        it("bypasses query filter when running in runAsPlatform", () => {
            const mockQuery = { where: vi.fn() };
            runAsPlatform(() => {
                findHook.call(mockQuery);
            });
            expect(mockQuery.where).not.toHaveBeenCalled();
        });
    });

    describe("tenantPlugin Aggregate Hook", () => {
        it("throws TenantContextMissingError if aggregate is called without context", () => {
            const mockAgg = { pipeline: vi.fn().mockReturnValue([]) };
            expect(() => {
                aggregateHook.call(mockAgg);
            }).toThrow(/TenantContextMissingError/);
        });

        it("auto-injects $match at front of aggregate pipeline", () => {
            const tenantId = new mongoose.Types.ObjectId().toString();
            const pipeline = [{ $group: { _id: "$name", count: { $sum: 1 } } }];
            const mockAgg = { pipeline: () => pipeline };

            runWithTenant({ tenantId }, () => {
                aggregateHook.call(mockAgg);
            });

            expect(pipeline[0]).toHaveProperty("$match");
            expect(pipeline[0].$match.tenantId.toString()).toBe(tenantId);
        });

        it("bypasses aggregate when running in runAsPlatform", () => {
            const pipeline = [{ $match: { name: "test" } }];
            const mockAgg = { pipeline: () => pipeline };

            runAsPlatform(() => {
                aggregateHook.call(mockAgg);
            });

            expect(pipeline).toHaveLength(1);
            expect(pipeline[0]).toEqual({ $match: { name: "test" } });
        });
    });

    describe("tenantPlugin Save & Validation", () => {
        it("stamps tenantId on document validation within tenant context", async () => {
            const tenantId = new mongoose.Types.ObjectId().toString();
            await runWithTenant({ tenantId }, async () => {
                const doc = new TestModel({ name: "Test Item" });
                await doc.validate();
                expect(doc.tenantId.toString()).toBe(tenantId);
            });
        });

        it("fails validation if document tenantId contradicts active context", async () => {
            const tenantA = new mongoose.Types.ObjectId().toString();
            const tenantB = new mongoose.Types.ObjectId().toString();

            await runWithTenant({ tenantId: tenantA }, async () => {
                const doc = new TestModel({ name: "Hacked Item", tenantId: tenantB });
                await expect(doc.validate()).rejects.toThrow(/TenantIsolationViolationError/);
            });
        });

        it("fails validation if save is attempted without tenant context", async () => {
            const doc = new TestModel({ name: "Orphan Item" });
            await expect(doc.validate()).rejects.toThrow(/TenantContextMissingError/);
        });
    });

    describe("tenantPlugin insertMany", () => {
        it("throws TenantContextMissingError without tenant context", () => {
            const docs = [{ name: "item1" }];
            expect(() => {
                insertManyHook(docs);
            }).toThrow(/TenantContextMissingError/);
        });

        it("stamps tenantId on array of docs in tenant context", () => {
            const tenantId = new mongoose.Types.ObjectId().toString();
            const docs = [{ name: "item1" }, { name: "item2" }];

            runWithTenant({ tenantId }, () => {
                insertManyHook(docs);
            });

            expect(docs[0].tenantId.toString()).toBe(tenantId);
            expect(docs[1].tenantId.toString()).toBe(tenantId);
        });
    });
});
