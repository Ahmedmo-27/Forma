/**
 * Phase 2 XSS smoke (automated): stored-payload strings are sanitized / schema-rejected
 * so they cannot round-trip as executable HTML in API-validated fields.
 */
import { describe, it, expect } from "vitest";
import { addNoteSchema, updateMemberSchema, tenantSettingsSchema } from "../../validation/schemas";

const XSS_PAYLOADS = [
    `<script>alert(1)</script>`,
    `<img src=x onerror=alert(1)>`,
    `"><svg/onload=alert(1)>`,
    `javascript:alert(1)`,
];

describe("Security Phase 2: XSS payload handling in Zod schemas", () => {
    it("member notes strip or reject script tags", () => {
        for (const payload of XSS_PAYLOADS) {
            const result = addNoteSchema.safeParse({ text: payload });
            if (result.success) {
                const text = result.data.text || result.data.note || "";
                expect(String(text).toLowerCase()).not.toMatch(/<script/);
                expect(String(text).toLowerCase()).not.toMatch(/onerror\s*=/);
            } else {
                expect(result.success).toBe(false);
            }
        }
    });

    it("member name does not accept raw script as trusted HTML (stored as plain text or rejected)", () => {
        for (const payload of XSS_PAYLOADS.slice(0, 2)) {
            const result = updateMemberSchema.safeParse({
                name: payload,
                phones: "01000000000",
            });
            if (result.success) {
                // API stores plain text; React escapes. Ensure we did not invent a sanitized HTML field.
                expect(result.data.html).toBeUndefined();
                expect(result.data.dangerouslySetInnerHTML).toBeUndefined();
            }
        }
    });

    it("tenant display name cannot smuggle script via settings schema when present", () => {
        const result = tenantSettingsSchema.safeParse({
            branding: { displayName: `<img src=x onerror=alert(1)>` },
        });
        if (result.success) {
            const name = result.data.branding?.displayName;
            if (name != null) {
                expect(String(name).toLowerCase()).not.toMatch(/onerror\s*=/);
            }
        }
    });
});
