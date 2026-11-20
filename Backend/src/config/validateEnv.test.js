import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { validateEnv, EXAMPLE_VALUES } = require("./validateEnv");

const good = {
    NODE_ENV: "production",
    MONGO_URI: "mongodb+srv://real-user:real-pass@cluster0.mongodb.net/forma",
    JWT_SECRET: "a".repeat(48),
    PLATFORM_JWT_SECRET: "b".repeat(48),
    TENANT_SECRET_KEY: "c".repeat(64),
    FRONTEND_ORIGIN: "https://app.forma-official.com",
};

describe("validateEnv", () => {
    it("passes a complete production environment", () => {
        expect(validateEnv(good)).toEqual({ errors: [], warnings: [] });
    });

    it("reports missing secrets in every environment", () => {
        const res = validateEnv({ NODE_ENV: "development" });
        expect(res.errors).toEqual(["Missing required secrets: JWT_SECRET, PLATFORM_JWT_SECRET, TENANT_SECRET_KEY"]);
        expect(validateEnv({ NODE_ENV: "test", JWT_SECRET: "x", PLATFORM_JWT_SECRET: "y", TENANT_SECRET_KEY: "z" }).errors)
            .toEqual([]);
    });

    it("rejects the .env.example placeholders in production only", () => {
        for (const [key, examples] of Object.entries(EXAMPLE_VALUES)) {
            const prod = validateEnv({ ...good, [key]: examples[0] });
            expect(prod.errors.join(" ")).toContain(`${key} is still the placeholder`);
            const dev = validateEnv({ ...good, NODE_ENV: "development", [key]: examples[0] });
            expect(dev.errors).toEqual([]);
        }
    });

    it("keeps the placeholder list in sync with .env.example", () => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const example = fs.readFileSync(path.resolve(here, "../../.env.example"), "utf8");
        for (const [key, examples] of Object.entries(EXAMPLE_VALUES)) {
            const line = example.split(/\r?\n/).find((row) => row.startsWith(`${key}=`));
            expect(line, key).toBeDefined();
            expect(examples, key).toContain(line.slice(key.length + 1).trim());
        }
    });

    it("rejects a Mongo URI that still has placeholders or is missing", () => {
        expect(validateEnv({ ...good, MONGO_URI: "mongodb+srv://<user>:<password>@c.mongodb.net/forma" }).errors)
            .toHaveLength(1);
        expect(validateEnv({ ...good, MONGO_URI: "" }).errors).toEqual(["MONGO_URI is required in production."]);
    });

    it("only warns about weak, identical, or incomplete settings", () => {
        const short = validateEnv({ ...good, JWT_SECRET: "short" });
        expect(short.errors).toEqual([]);
        expect(short.warnings.join(" ")).toContain("JWT_SECRET is shorter");

        const same = validateEnv({ ...good, PLATFORM_JWT_SECRET: good.JWT_SECRET });
        expect(same.errors).toEqual([]);
        expect(same.warnings.join(" ")).toContain("identical");

        const noOrigin = validateEnv({ ...good, FRONTEND_ORIGIN: undefined });
        expect(noOrigin.errors).toEqual([]);
        expect(noOrigin.warnings.join(" ")).toContain("FRONTEND_ORIGIN");
    });
});
