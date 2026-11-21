import { describe, it, expect, afterEach } from "vitest";
import { isCrossSiteAuthRequest, sharesRegistrableDomain } from "./crossSiteAuth";

describe("crossSiteAuth", () => {
    const prev = { ...process.env };

    afterEach(() => {
        process.env.BASE_DOMAIN = prev.BASE_DOMAIN;
    });

    it("sharesRegistrableDomain matches app/api under forma-official.com", () => {
        expect(sharesRegistrableDomain("app.forma-official.com", "api.forma-official.com")).toBe(true);
        expect(sharesRegistrableDomain("eap-dszt.vercel.app", "api.forma-official.com")).toBe(false);
    });

    it("treats Vercel preview as cross-site when BASE_DOMAIN is set", () => {
        process.env.BASE_DOMAIN = "forma-official.com";
        const req = {
            get: (name) => (name === "origin" ? "https://eap-dszt.vercel.app" : undefined),
            headers: { origin: "https://eap-dszt.vercel.app" },
            protocol: "https",
        };
        expect(isCrossSiteAuthRequest(req)).toBe(true);
    });

    it("treats app.forma-official.com as same-site when BASE_DOMAIN is set", () => {
        process.env.BASE_DOMAIN = "forma-official.com";
        const req = {
            get: (name) => (name === "origin" ? "https://app.forma-official.com" : undefined),
            headers: { origin: "https://app.forma-official.com" },
            protocol: "https",
        };
        expect(isCrossSiteAuthRequest(req)).toBe(false);
    });

    it("treats localhost as same-origin (Vite proxy)", () => {
        process.env.BASE_DOMAIN = "forma-official.com";
        const req = {
            get: (name) => (name === "origin" ? "http://localhost:5173" : undefined),
            headers: { origin: "http://localhost:5173" },
            protocol: "http",
        };
        expect(isCrossSiteAuthRequest(req)).toBe(false);
    });
});
