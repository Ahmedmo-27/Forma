/**
 * Phase 2 — SVG upload responses must carry a restrictive CSP (no script execution).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Security Phase 2: SVG response CSP", () => {
    it("app.js sets CSP default-src none for image/svg+xml uploads", () => {
        const src = fs.readFileSync(path.resolve(__dirname, "../../app.js"), "utf8");
        expect(src).toMatch(/mime === ["']image\/svg\+xml["']/);
        expect(src).toMatch(
            /Content-Security-Policy["']\s*,\s*["']default-src 'none'; style-src 'unsafe-inline'["']/
        );
    });
});
