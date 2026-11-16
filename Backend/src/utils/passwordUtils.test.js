import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
    BCRYPT_ROUNDS,
    hashPassword,
    inspectStoredPassword,
    verifyPassword,
} from "./passwordUtils";

describe("passwordUtils bcrypt cost migration", () => {
    it("hashes new passwords at the app cost factor (12)", async () => {
        expect(BCRYPT_ROUNDS).toBe(12);
        const hashed = await hashPassword("Password123!");
        const inspection = inspectStoredPassword(hashed);
        expect(inspection.valid).toBe(true);
        expect(inspection.rounds).toBe(12);
        expect(inspection.matchesAppRounds).toBe(true);
    });

    it("flags legacy cost-10 hashes for rehash on successful verify", async () => {
        const legacy = await bcrypt.hash("Password123!", 10);
        const result = await verifyPassword("Password123!", legacy);
        expect(result.match).toBe(true);
        expect(result.needsRehash).toBe(true);
        expect(result.inspection.rounds).toBe(10);
        expect(result.inspection.matchesAppRounds).toBe(false);
    });

    it("does not request rehash when hash already matches app rounds", async () => {
        const current = await hashPassword("Password123!");
        const result = await verifyPassword("Password123!", current);
        expect(result.match).toBe(true);
        expect(result.needsRehash).toBe(false);
    });
});
