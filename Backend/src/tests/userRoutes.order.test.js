import { describe, it, expect } from "vitest";
import userRoutes from "../routes/userRoutes";

describe("user route order", () => {
    it("registers /allTeams before /:id so the teams handler is reachable", () => {
        const paths = userRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => {
                const method = Object.keys(layer.route.methods)[0];
                return `${method} ${layer.route.path}`;
            });

        expect(paths.indexOf("get /allTeams")).toBeGreaterThan(-1);
        expect(paths.indexOf("get /allTeams")).toBeLessThan(paths.indexOf("get /:id"));
    });
});
