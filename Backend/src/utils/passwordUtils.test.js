import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
    BCRYPT_ROUNDS,
    hashPassword,
    inspectStoredPassword,
    validatePasswordStrength,
    verifyPassword,
} from "./passwordUtils";

describe("validatePasswordStrength", () => {
    it("accepts a password that meets all rules", () => {
        expect(validatePasswordStrength("Password123!").valid).toBe(true);
    });

    it("rejects passwords that are too short", () => {
        const result = validatePasswordStrength("Ab1!");
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/at least 8/i);
    });

    it("rejects passwords missing an uppercase letter", () => {
        const result = validatePasswordStrength("password123!");
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/uppercase/i);
    });

    it("rejects passwords missing a lowercase letter", () => {
        const result = validatePasswordStrength("PASSWORD123!");
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/lowercase/i);
    });

    it("rejects passwords missing a number", () => {
        const result = validatePasswordStrength("Password!!");
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/number/i);
    });

    it("rejects passwords missing a special character", () => {
        const result = validatePasswordStrength("Password123");
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/special/i);
    });
});

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
