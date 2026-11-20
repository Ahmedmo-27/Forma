import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SchedulerLock = require("../models/SchedulerLock");
const { acquireLock, releaseLock, runExclusive, INSTANCE_ID } = require("./schedulerLock");

const duplicateKey = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

describe("schedulerLock", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("claims a free or expired lock for the hold window", async () => {
        const update = vi.spyOn(SchedulerLock, "findOneAndUpdate").mockResolvedValue(null);
        const now = new Date("2026-03-10T12:00:00.000Z");

        await expect(acquireLock("job", 60_000, now)).resolves.toBe(true);

        const [filter, patch, options] = update.mock.calls[0];
        expect(filter).toEqual({ _id: "job", expiresAt: { $lte: now } });
        expect(patch.$set.owner).toBe(INSTANCE_ID);
        expect(patch.$set.expiresAt).toEqual(new Date(now.getTime() + 60_000));
        expect(options).toEqual({ upsert: true });
    });

    it("reports false when another instance still holds the lock", async () => {
        vi.spyOn(SchedulerLock, "findOneAndUpdate").mockRejectedValue(duplicateKey());
        await expect(acquireLock("job", 60_000)).resolves.toBe(false);
    });

    it("rethrows unexpected lock errors", async () => {
        vi.spyOn(SchedulerLock, "findOneAndUpdate").mockRejectedValue(new Error("db down"));
        await expect(acquireLock("job", 60_000)).rejects.toThrow("db down");
    });

    it("runs the job only when the lock is won", async () => {
        const job = vi.fn().mockResolvedValue("done");

        vi.spyOn(SchedulerLock, "findOneAndUpdate").mockResolvedValueOnce(null);
        await expect(runExclusive("job", 1_800_000, job)).resolves.toBe("done");
        expect(job).toHaveBeenCalledTimes(1);

        vi.spyOn(SchedulerLock, "findOneAndUpdate").mockRejectedValueOnce(duplicateKey());
        await expect(runExclusive("job", 1_800_000, job)).resolves.toBeUndefined();
        expect(job).toHaveBeenCalledTimes(1);
    });

    it("holds slightly less than the full interval so the next tick can run", async () => {
        const update = vi.spyOn(SchedulerLock, "findOneAndUpdate").mockResolvedValue(null);
        await runExclusive("job", 1_000_000, async () => {});
        const [, patch] = update.mock.calls[0];
        const held = patch.$set.expiresAt.getTime() - patch.$set.lockedAt.getTime();
        expect(held).toBe(900_000);
    });

    it("releases the lock when the job fails so the next tick retries", async () => {
        vi.spyOn(SchedulerLock, "findOneAndUpdate").mockResolvedValue(null);
        const release = vi.spyOn(SchedulerLock, "updateOne").mockResolvedValue({});

        await expect(runExclusive("job", 60_000, async () => { throw new Error("boom"); })).rejects.toThrow("boom");

        expect(release).toHaveBeenCalledWith(
            { _id: "job", owner: INSTANCE_ID },
            { $set: { expiresAt: new Date(0) } }
        );
    });

    it("still runs the job when the lock store is unreachable", async () => {
        vi.spyOn(SchedulerLock, "findOneAndUpdate").mockRejectedValue(new Error("db down"));
        const job = vi.fn().mockResolvedValue("ran");
        await expect(runExclusive("job", 60_000, job)).resolves.toBe("ran");
        expect(job).toHaveBeenCalledTimes(1);
    });

    it("releaseLock swallows errors", async () => {
        vi.spyOn(SchedulerLock, "updateOne").mockRejectedValue(new Error("db down"));
        await expect(releaseLock("job")).resolves.toBeUndefined();
    });
});
