import { describe, it, expect, afterEach } from "vitest";
import { ManualTransferAdapter } from "../services/billing/paymentAdapter";

const KEYS = ["PAYMENT_BANK_NAME", "PAYMENT_ACCOUNT_NAME", "PAYMENT_IBAN", "PAYMENT_SWIFT", "NODE_ENV"];

describe("manual transfer bank details", () => {
    const saved = {};

    afterEach(() => {
        for (const key of KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });

    function snapshotEnv() {
        for (const key of KEYS) saved[key] = process.env[key];
    }

    it("uses configured bank details", async () => {
        snapshotEnv();
        process.env.NODE_ENV = "production";
        process.env.PAYMENT_BANK_NAME = "National Bank of Egypt";
        process.env.PAYMENT_ACCOUNT_NAME = "Leap Gym";
        process.env.PAYMENT_IBAN = "EG380001234567890123456789012";
        process.env.PAYMENT_SWIFT = "NBEGEGCX";

        const session = await new ManualTransferAdapter().initiatePayment({
            tenant: { _id: "tenant-1" },
            plan: { key: "gold" },
            planPrice: {},
            amount: 1000,
            currency: "EGP",
        });

        expect(session.instructions.bankName).toBe("National Bank of Egypt");
        expect(session.instructions.accountName).toBe("Leap Gym");
        expect(session.instructions.iban).toBe("EG380001234567890123456789012");
        expect(session.instructions.swift).toBe("NBEGEGCX");
        expect(session.instructions.referenceCode).toBe(session.paymentRef);
    });

    it("refuses checkout in production when bank details are missing", async () => {
        snapshotEnv();
        process.env.NODE_ENV = "production";
        delete process.env.PAYMENT_BANK_NAME;
        delete process.env.PAYMENT_ACCOUNT_NAME;
        delete process.env.PAYMENT_IBAN;
        delete process.env.PAYMENT_SWIFT;

        await expect(
            new ManualTransferAdapter().initiatePayment({
                tenant: { _id: "tenant-1" },
                plan: { key: "gold" },
                planPrice: {},
                amount: 1000,
                currency: "EGP",
            })
        ).rejects.toThrow(/Bank transfer details are not configured/);
    });
});
