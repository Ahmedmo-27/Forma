import { describe, it, expect } from "vitest";
import { formatCode } from "../controllers/locationController";
import { formatUserResponse } from "../utils/userAbilities";

describe("location code formatting", () => {
    it("pads location sequence codes", () => {
        expect(formatCode(1)).toBe("LOC-001");
        expect(formatCode(12)).toBe("LOC-012");
        expect(formatCode(100)).toBe("LOC-100");
    });
});

describe("formatUserResponse location fields", () => {
    it("exposes Owner as canAccessAllLocations with null resolved set", () => {
        const formatted = formatUserResponse(
            {
                _id: "1",
                name: "Owner",
                email: "o@x.com",
                role: "Owner",
                allowedLocationIds: [],
                canAccessAllLocations: false,
            },
            { tenant: {} }
        );
        expect(formatted.canAccessAllLocations).toBe(true);
        expect(formatted.resolvedLocationIds).toBeNull();
    });

    it("exposes restricted staff allowedLocationIds", () => {
        const formatted = formatUserResponse(
            {
                _id: "2",
                name: "Rep",
                email: "r@x.com",
                role: "Sales",
                allowedLocationIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"],
                canAccessAllLocations: false,
            },
            { tenant: {} }
        );
        expect(formatted.canAccessAllLocations).toBe(false);
        expect(formatted.allowedLocationIds).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaa"]);
        expect(formatted.resolvedLocationIds).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaa"]);
    });
});
