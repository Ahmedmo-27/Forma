import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Guards against shipping locationScopeOptional on a router while the
 * controller never merges req.locationFilter / req.locationScope — the main
 * multi-branch leak class (application-level scoping, not a plugin).
 */
const ROUTES_DIR = path.resolve(__dirname, "../routes");
const CONTROLLERS_DIR = path.resolve(__dirname, "../controllers");

const ROUTE_TO_CONTROLLER = {
    membersRoutes: "memberController",
    userRoutes: "userController",
    analyticsRoutes: "gymAnalyticsController",
    biRoutes: "biController",
    contractRoutes: "contractController",
    taskRoutes: "taskController",
    salesRequestRoutes: "salesRequestController",
    coachRequestRoutes: "coachRequestController",
    packageExceptionRoutes: "packageExceptionController",
    // Packages use eligibility fields; location middleware is for future list filtering
    packageRoutes: "packageController",
};

const MUST_USE_LOCATION = new Set([
    "memberController",
    "userController",
    "gymAnalyticsController",
    "biController",
    "contractController",
    "taskController",
    "salesRequestController",
    "coachRequestController",
    "packageExceptionController",
]);

function listRouteFilesUsingLocationScope() {
    return fs
        .readdirSync(ROUTES_DIR)
        .filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))
        .filter((name) => {
            const src = fs.readFileSync(path.join(ROUTES_DIR, name), "utf8");
            return src.includes("locationScopeOptional") || src.includes("locationScope(");
        })
        .map((name) => name.replace(/\.js$/, ""));
}

describe("locationScope wiring inventory", () => {
    it("every route module with locationScopeOptional maps to a known controller", () => {
        const wired = listRouteFilesUsingLocationScope();
        expect(wired.length).toBeGreaterThanOrEqual(8);
        for (const route of wired) {
            expect(ROUTE_TO_CONTROLLER[route]).toBeTruthy();
        }
    });

    it("member/list/report controllers merge req.locationFilter or locationScope", () => {
        for (const controller of MUST_USE_LOCATION) {
            const file = path.join(CONTROLLERS_DIR, `${controller}.js`);
            const src = fs.readFileSync(file, "utf8");
            const usesFilter =
                src.includes("req.locationFilter")
                || src.includes("req.locationScope")
                || src.includes("locationFilter");
            if (!usesFilter) {
                throw new Error(`${controller} must reference locationFilter/locationScope`);
            }
            expect(usesFilter).toBe(true);
        }
    });

    it("documents intentional tenant-wide routes (no location middleware)", () => {
        const intentional = [
            "whatsappSessionRoutes",
            "whatsappTemplateRoutes",
            "notificationRoutes",
            "tenantBillingRoutes",
            "tenantRoutes",
        ];
        for (const route of intentional) {
            const file = path.join(ROUTES_DIR, `${route}.js`);
            if (!fs.existsSync(file)) continue;
            const src = fs.readFileSync(file, "utf8");
            expect(src.includes("locationScopeOptional")).toBe(false);
        }
    });
});
