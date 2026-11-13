import { describe, it, expect } from "vitest";
import { ACCESS_CATALOG } from "../../config/accessCatalog.js";
import { AREA_KEYS } from "../../config/roleAccess.js";
import {
    checklist,
    expectAllowed,
    expectAreas,
    expectDenied,
    expectKeys,
    expectList,
    readSource,
    staff,
} from "./helpers.js";

const manager = () => staff("General Manager");

describe("General Manager", () => {
    it("follows the owner plus coaching tools, and never gym settings", () => {
        const keys = ACCESS_CATALOG.map((feature) => feature.key).filter((key) => key !== "settings");
        expectKeys("General Manager", keys);
        expect(keys).toContain("owner_dashboard");
        expect(keys).toContain("coach_targets");
        expect(keys).not.toContain("settings");
        expectAreas("General Manager", [...AREA_KEYS]);
        expectList("General Manager", "all");
    });

    it("can use owner areas and the owner dashboard", () => {
        const user = manager();
        const pages = readSource("..", "..", "Frontend", "src", "App.jsx");
        expect(pages).toContain("roles={['Owner', 'General Manager']} access=\"owner_dashboard\"");
        expect(pages).toContain("roles={['Owner', 'General Manager']} access=\"teams_overview\"");
        expectAllowed("packages", ["Owner", "Sales Manager"], user);
        expectAllowed("refunds", ["Owner", "Accountant"], user);
        expectAllowed("teams_overview", ["Owner"], user);
        expectAllowed("check_in", ["Receptionist", "Owner", "Sales Manager", "Sales"], user);
        expectAllowed("coach_checkin", ["Coach", "Head Coach"], user);
        expectAllowed("access_control", ["Owner", "General Manager"], user);
        expectAllowed("change_role", ["Owner", "General Manager", "Sales Manager"], user);
        expect(pages).toMatch(/roles=\{.*'General Manager'.*\}\s+access="access_control"/);
        const usersRoute = readSource("routes", "userRoutes.js");
        expect(usersRoute).toContain('allowRoles("change_role", "Owner", "General Manager", "Sales Manager")');
    });

    it("cannot change gym settings", () => {
        const pages = readSource("..", "..", "Frontend", "src", "App.jsx");
        expect(pages).toContain("roles={['Owner']} access=\"settings\"");
        expectDenied("settings", ["Owner"], manager());
    });

    it("loses an area the owner removed from the checklist", () => {
        expectDenied(
            "check_in",
            ["Receptionist", "Owner", "Sales Manager", "Sales"],
            manager(),
            checklist("General Manager", ["members", "staff"])
        );
        expectAllowed(
            "members",
            ["Receptionist", "Owner", "Sales Manager", "Sales"],
            manager(),
            checklist("General Manager", ["members", "staff"])
        );
    });
});
