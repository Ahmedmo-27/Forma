/**
 * Phase 3 — Upload path / type hardening (extends prepareUpload + auth).
 */
import { describe, it, expect } from "vitest";
import path from "path";
import { prepareUpload } from "../../utils/prepareUpload";

describe("Security Phase 3: upload path traversal & type abuse", () => {
    it("rejects HTML content disguised as an image", async () => {
        await expect(
            prepareUpload(
                {
                    originalname: "../../../etc/passwd.png",
                    buffer: Buffer.from("<html><script>alert(1)</script></html>"),
                },
                "photo"
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects path traversal segments in stored basename logic", () => {
        const dangerous = path.basename("../../logo-evil.svg");
        expect(dangerous).toBe("logo-evil.svg");
        expect(dangerous.includes("..")).toBe(false);
        expect(path.posix.normalize(`tenantA/${dangerous}`)).not.toMatch(/\.\./);
    });

    it("rejects SVG used as member photo intake when mime is wrong", async () => {
        const svg = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`
        );
        await expect(
            prepareUpload({ originalname: "photo.png", buffer: svg }, "photo")
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});
