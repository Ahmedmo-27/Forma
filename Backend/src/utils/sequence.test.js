import { describe, it, expect, vi } from "vitest";
const { isDuplicateKeyError, nextSequence } = require("./sequence");
const Counter = require("../models/Counter");
const { runWithTenant } = require("../context/tenantContext");
const mongoose = require("mongoose");

describe("sequence utils & per-tenant counters", () => {
    describe("isDuplicateKeyError", () => {
        it("detects duplicate key errors for tracked fields", () => {
            const err = { code: 11000, keyPattern: { systemId: 1 } };
            expect(isDuplicateKeyError(err, ["systemId", "memberId"])).toBe(true);
        });

        it("ignores duplicate key errors on other fields", () => {
            const err = { code: 11000, keyPattern: { email: 1 } };
            expect(isDuplicateKeyError(err, ["systemId", "memberId"])).toBe(false);
        });
    });

    describe("nextSequence atomic allocation", () => {
        it("throws TenantContextMissingError when called without tenant context or override", async () => {
            await expect(nextSequence("systemId", 100000)).rejects.toThrow(
                /TenantContextMissingError/
            );
        });

        it("allocates gap-free sequences isolated per tenant", async () => {
            const tenantA = new mongoose.Types.ObjectId().toString();
            const tenantB = new mongoose.Types.ObjectId().toString();

            const mockCounters = new Map();

            vi.spyOn(Counter, "findOneAndUpdate").mockImplementation(async (filter, update) => {
                const key = `${filter.tenantId.toString()}:${filter.name}`;
                let current = mockCounters.get(key) || 0;
                if (update.$inc) {
                    current += update.$inc.seq;
                    mockCounters.set(key, current);
                    return { seq: current };
                }
                if (update.$set) {
                    current = update.$set.seq;
                    mockCounters.set(key, current);
                    return { seq: current };
                }
                return { seq: current };
            });

            // Tenant A sequences starting at 100000
            const a1 = await runWithTenant({ tenantId: tenantA }, () => nextSequence("systemId", 100000));
            const a2 = await runWithTenant({ tenantId: tenantA }, () => nextSequence("systemId", 100000));
            expect(a1).toBe(100000);
            expect(a2).toBe(100001);

            // Tenant B sequences starting at 100000 independently
            const b1 = await runWithTenant({ tenantId: tenantB }, () => nextSequence("systemId", 100000));
            expect(b1).toBe(100000);

            vi.restoreAllMocks();
        });
    });
});
