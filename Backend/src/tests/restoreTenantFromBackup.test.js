import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { copyCollection, parseArgs, restoreTenant } = require("../scripts/restoreTenantFromBackup");

function fakeSource(docs) {
    return {
        collection: () => ({
            find: () => ({
                async *[Symbol.asyncIterator]() {
                    yield* docs;
                },
            }),
        }),
    };
}

function fakeTarget({ existingIds = [], upserted = 0, modified = 0 } = {}) {
    const bulkWrite = vi.fn().mockResolvedValue({ upsertedCount: upserted, modifiedCount: modified });
    const countDocuments = vi.fn().mockResolvedValue(existingIds.length);
    return { db: { collection: () => ({ bulkWrite, countDocuments }) }, bulkWrite, countDocuments };
}

const docs = [{ _id: 1, tenantId: "t" }, { _id: 2, tenantId: "t" }, { _id: 3, tenantId: "t" }];

describe("restoreTenantFromBackup", () => {
    it("parses flags and defaults the target to MONGO_URI", () => {
        process.env.MONGO_URI = "mongodb://prod/forma";
        const args = parseArgs(["--from", "mongodb://scratch/forma_restore", "--tenant", "acme", "--apply"]);
        expect(args).toMatchObject({
            from: "mongodb://scratch/forma_restore",
            to: "mongodb://prod/forma",
            tenant: "acme",
            apply: true,
            overwrite: false,
        });
    });

    it("dry run writes nothing and reports which documents already exist", async () => {
        const target = fakeTarget({ existingIds: [1] });
        const result = await copyCollection({
            source: fakeSource(docs),
            target: target.db,
            name: "members",
            filter: { tenantId: "t" },
            apply: false,
            overwrite: false,
        });
        expect(target.bulkWrite).not.toHaveBeenCalled();
        expect(result).toEqual({ collection: "members", found: 3, written: 2, kept: 1 });
    });

    it("apply inserts only missing documents by default", async () => {
        const target = fakeTarget({ upserted: 2 });
        const result = await copyCollection({
            source: fakeSource(docs),
            target: target.db,
            name: "members",
            filter: { tenantId: "t" },
            apply: true,
            overwrite: false,
        });
        const ops = target.bulkWrite.mock.calls[0][0];
        expect(ops).toHaveLength(3);
        expect(ops[0]).toEqual({ updateOne: { filter: { _id: 1 }, update: { $setOnInsert: docs[0] }, upsert: true } });
        expect(result).toEqual({ collection: "members", found: 3, written: 2, kept: 1 });
    });

    it("overwrite replaces documents", async () => {
        const target = fakeTarget({ upserted: 1, modified: 2 });
        const result = await copyCollection({
            source: fakeSource(docs),
            target: target.db,
            name: "members",
            filter: { tenantId: "t" },
            apply: true,
            overwrite: true,
        });
        expect(target.bulkWrite.mock.calls[0][0][0]).toHaveProperty("replaceOne");
        expect(result.written).toBe(3);
    });

    it("refuses to restore a database onto itself", async () => {
        await expect(
            restoreTenant({ from: "mongodb://x/forma", to: "mongodb://x/forma", tenant: "acme" })
        ).rejects.toThrow(/must be different/);
    });
});
