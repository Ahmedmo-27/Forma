/**
 * Phase 2 — Static guards for SPA XSS surfaces (no dangerouslySetInnerHTML; cookie session hygiene).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const frontendSrc = path.resolve(__dirname, "../../../../Frontend/src");

function walk(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (/\.(jsx?|tsx?)$/.test(entry.name)) acc.push(full);
    }
    return acc;
}

describe("Security Phase 2: frontend XSS surface", () => {
    it("does not use dangerouslySetInnerHTML in Frontend/src", () => {
        const files = walk(frontendSrc);
        const offenders = [];
        for (const file of files) {
            const text = fs.readFileSync(file, "utf8");
            if (text.includes("dangerouslySetInnerHTML")) {
                offenders.push(path.relative(frontendSrc, file));
            }
        }
        expect(offenders).toEqual([]);
    });

    it("does not persist JWTs in localStorage (cookie session)", () => {
        const auth = fs.readFileSync(
            path.join(frontendSrc, "context", "AuthContext.jsx"),
            "utf8"
        );
        expect(auth).not.toMatch(/setItem\(\s*['"]ff_token['"]/);
        expect(auth).not.toMatch(/impersonation_token/);
        expect(auth).toMatch(/removeItem\(['"]ff_token['"]\)/);
        expect(auth).toMatch(/removeItem\(['"]ff_user['"]\)/);
        expect(auth).toMatch(/\/users\/logout/);
    });

    it("platform auth does not persist JWTs in localStorage", () => {
        const auth = fs.readFileSync(
            path.join(frontendSrc, "platform", "lib", "auth", "AuthContext.jsx"),
            "utf8"
        );
        expect(auth).not.toMatch(/setItem\(\s*['"]leap_platform_token['"]/);
        expect(auth).not.toMatch(/setItem\(\s*['"]leap_platform_refresh_token['"]/);
        expect(auth).toMatch(/\/auth\/logout/);
    });
});
