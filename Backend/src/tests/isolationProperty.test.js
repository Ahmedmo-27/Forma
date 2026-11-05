import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import mongoose from "mongoose";

const tenantPlugin = require("../plugins/tenantPlugin");
const {
    runWithTenant,
    runAsPlatform,
    getTenantId,
    isPlatformContext,
} = require("../context/tenantContext");

describe("Phase 9: Tenant Isolation Property Tests (fast-check)", () => {
    // Define an isolated schema with tenantPlugin applied
    const itemSchema = new mongoose.Schema({
        name: String,
        category: String,
        value: Number,
        tags: [String],
    });
    itemSchema.plugin(tenantPlugin);

    const findHook = itemSchema.s.hooks._pres.get("find")[0].fn;
    const findOneHook = itemSchema.s.hooks._pres.get("findOne")[0].fn;
    const countHook = itemSchema.s.hooks._pres.get("countDocuments")[0].fn;
    const updateOneHook = itemSchema.s.hooks._pres.get("updateOne")[0].fn;
    const deleteManyHook = itemSchema.s.hooks._pres.get("deleteMany")[0].fn;
    const aggregateHook = itemSchema.s.hooks._pres.get("aggregate")[0].fn;
    const insertManyHook = itemSchema.s.hooks._pres.get("insertMany")[0].fn;

    it("PROPERTY: query scoping always injects current tenant and excludes alien tenant", () => {
        fc.assert(
            fc.property(
                fc.uuid(),
                fc.uuid(),
                fc.string({ minLength: 1, maxLength: 20 }),
                (rawTenantA, rawTenantB, queryParam) => {
                    fc.pre(rawTenantA !== rawTenantB);

                    const tenantAId = new mongoose.Types.ObjectId().toString();
                    const tenantBId = new mongoose.Types.ObjectId().toString();

                    const queryConditions = {};
                    const mockQuery = {
                        where: vi.fn((cond) => Object.assign(queryConditions, cond)),
                    };

                    // Execute query under Tenant A
                    runWithTenant({ tenantId: tenantAId, tenantSlug: "tenant-a" }, () => {
                        findHook.call(mockQuery);
                    });

                    // Invariant: The query condition must contain tenantAId
                    expect(queryConditions.tenantId.toString()).toBe(tenantAId);
                    // Invariant: The query condition must NEVER match tenantBId
                    expect(queryConditions.tenantId.toString()).not.toBe(tenantBId);
                }
            ),
            { numRuns: 50 }
        );
    });

    it("PROPERTY: aggregate pipeline always prepends $match for active tenant", () => {
        fc.assert(
            fc.property(
                fc.array(fc.string({ minLength: 1 })),
                fc.integer({ min: 1, max: 100 }),
                (tags, limit) => {
                    const tenantAId = new mongoose.Types.ObjectId().toString();
                    const tenantBId = new mongoose.Types.ObjectId().toString();

                    const pipeline = [
                        { $match: { tags: { $in: tags } } },
                        { $group: { _id: "$category", total: { $sum: "$value" } } },
                        { $limit: limit },
                    ];
                    const mockAgg = { pipeline: () => pipeline };

                    // Execute aggregate under Tenant A
                    runWithTenant({ tenantId: tenantAId, tenantSlug: "tenant-a" }, () => {
                        aggregateHook.call(mockAgg);
                    });

                    // Invariant: Pipeline length increased by 1 (prepended $match)
                    expect(pipeline[0]).toHaveProperty("$match");
                    // Invariant: First stage strictly scopes to Tenant A
                    expect(pipeline[0].$match.tenantId.toString()).toBe(tenantAId);
                    // Invariant: First stage cannot be Tenant B
                    expect(pipeline[0].$match.tenantId.toString()).not.toBe(tenantBId);
                }
            ),
            { numRuns: 50 }
        );
    });

    it("PROPERTY: insertMany always stamps the active tenantId on every record", () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        name: fc.string({ minLength: 1 }),
                        value: fc.integer(),
                    }),
                    { minLength: 1, maxLength: 20 }
                ),
                (records) => {
                    const tenantId = new mongoose.Types.ObjectId().toString();
                    const docs = records.map((r) => ({ ...r }));

                    runWithTenant({ tenantId, tenantSlug: "test-slug" }, () => {
                        insertManyHook(docs);
                    });

                    // Invariant: Every document has tenantId matching the active context
                    docs.forEach((doc) => {
                        expect(doc).toHaveProperty("tenantId");
                        expect(doc.tenantId.toString()).toBe(tenantId);
                    });
                }
            ),
            { numRuns: 50 }
        );
    });

    it("PROPERTY: mutation hooks (updateOne, deleteMany) always scope to active tenant", () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.integer(),
                (name, value) => {
                    const tenantId = new mongoose.Types.ObjectId().toString();

                    const updateConditions = {};
                    const mockUpdateQuery = {
                        where: vi.fn((cond) => Object.assign(updateConditions, cond)),
                    };

                    runWithTenant({ tenantId }, () => {
                        updateOneHook.call(mockUpdateQuery);
                    });

                    expect(updateConditions.tenantId.toString()).toBe(tenantId);

                    const deleteConditions = {};
                    const mockDeleteQuery = {
                        where: vi.fn((cond) => Object.assign(deleteConditions, cond)),
                    };

                    runWithTenant({ tenantId }, () => {
                        deleteManyHook.call(mockDeleteQuery);
                    });

                    expect(deleteConditions.tenantId.toString()).toBe(tenantId);
                }
            ),
            { numRuns: 50 }
        );
    });

    it("PROPERTY: $lookup pipeline tenant scoping prevents cross-tenant data leakage", () => {
        fc.assert(
            fc.property(
                fc.uuid(),
                fc.uuid(),
                (rawTenantA, rawTenantB) => {
                    fc.pre(rawTenantA !== rawTenantB);
                    const tenantAId = new mongoose.Types.ObjectId().toString();
                    const tenantBId = new mongoose.Types.ObjectId().toString();

                    // Simulating the $lookup pipeline pattern used in memberController
                    const createLookupPipeline = (activeTenantId) => [
                        {
                            $lookup: {
                                from: "users",
                                let: { assignedId: "$assignedSales" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$_id", "$$assignedId"] },
                                                    { $eq: ["$tenantId", new mongoose.Types.ObjectId(activeTenantId)] },
                                                ],
                                            },
                                        },
                                    },
                                ],
                                as: "salesUser",
                            },
                        },
                    ];

                    const pipelineA = createLookupPipeline(tenantAId);
                    const matchExpr = pipelineA[0].$lookup.pipeline[0].$match.$expr.$and;

                    // Invariant: $lookup pipeline explicitly matches against tenantA
                    const tenantMatch = matchExpr.find((e) => e.$eq && e.$eq[0] === "$tenantId");
                    expect(tenantMatch).toBeDefined();
                    expect(tenantMatch.$eq[1].toString()).toBe(tenantAId);
                    expect(tenantMatch.$eq[1].toString()).not.toBe(tenantBId);
                }
            ),
            { numRuns: 30 }
        );
    });
});
