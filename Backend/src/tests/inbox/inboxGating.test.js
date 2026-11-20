import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, "../..", relative), "utf8");

const Plan = require("../../models/Plan");
const { ACCESS_CATALOG } = require("../../config/accessCatalog");
const { inboxReplySchema, inboxConversationPatchSchema } = require("../../validation/schemas");

const routesSource = read("routes/inboxRoutes.js");
const appSource = read("app.js");

describe("inbox route gating", () => {
    it("has no route before authentication", () => {
        const protectAt = routesSource.indexOf("router.use(protect)");
        expect(protectAt).toBeGreaterThan(-1);
        const before = routesSource.slice(0, protectAt);
        expect(before.match(/router\.(get|post|patch|delete|put)\(/g)).toBeNull();
    });

    it("gates every protected route by plan, subscription, and role access", () => {
        const protectedPart = routesSource.slice(routesSource.indexOf("router.use(protect)"));
        expect(protectedPart).toContain('router.use(requireFeature("inbox"))');
        expect(protectedPart).toContain("router.use(enforceSubscriptionStatus)");

        const routes = [...protectedPart.matchAll(/router\.(get|post|patch|delete)\(\s*"([^"]+)",\s*allowRoles\(/g)];
        const handlers = [...protectedPart.matchAll(/router\.(get|post|patch|delete)\(/g)];
        expect(routes.length).toBe(handlers.length);
        expect(routes.length).toBeGreaterThanOrEqual(6);
    });

    it("lets only managers remove channels", () => {
        const remove = routesSource.match(/"\/channels\/:id",\s*allowRoles\(([^)]*)\)/)[1];
        expect(remove).not.toContain('"Sales"');
        expect(remove).toContain('"Owner"');
    });

    it("mounts the inbox routes and no Meta webhook or OAuth surface", () => {
        expect(appSource).toContain('app.use("/api/inbox", inboxRoutes)');
        expect(appSource).not.toMatch(/metaWebhook|\/api\/webhooks/);
        expect(routesSource).not.toMatch(/meta/i);
    });
});

describe("inbox plan and access catalog", () => {
    it("registers the inbox plan feature and ties both access keys to it", () => {
        expect(Plan.ALL_FEATURES).toContain("inbox");
        for (const key of ["inbox_view", "inbox_reply"]) {
            const feature = ACCESS_CATALOG.find((item) => item.key === key);
            expect(feature, key).toBeDefined();
            expect(feature.planFeature).toBe("inbox");
        }
    });

    it("seeds the inbox on the higher plans only", () => {
        const seed = read("scripts/seedPlans.js");
        const block = (key) => seed.slice(seed.indexOf(`key: "${key}"`)).split("isActive")[0];
        expect(block("gold")).toContain('"inbox"');
        expect(block("platinum")).toContain('"inbox"');
        expect(block("basic")).not.toContain('"inbox"');
    });
});

describe("inbox request validation", () => {
    it("requires non-empty reply text", () => {
        expect(inboxReplySchema.safeParse({ text: "Hello" }).success).toBe(true);
        expect(inboxReplySchema.safeParse({ text: "   " }).success).toBe(false);
        expect(inboxReplySchema.safeParse({}).success).toBe(false);
    });

    it("does not turn omitted patch fields into unassign or unlink", () => {
        const parsed = inboxConversationPatchSchema.parse({ markRead: true });
        expect(parsed).toEqual({ markRead: true });
        expect("assignedTo" in parsed).toBe(false);
        expect("memberId" in parsed).toBe(false);
    });

    it("clears an assignment only when null or an empty string is sent", () => {
        expect(inboxConversationPatchSchema.parse({ assignedTo: null }).assignedTo).toBeNull();
        expect(inboxConversationPatchSchema.parse({ assignedTo: "" }).assignedTo).toBeNull();
        expect(inboxConversationPatchSchema.safeParse({ assignedTo: "not-an-id" }).success).toBe(false);
    });

    it("rejects an empty patch and unknown statuses", () => {
        expect(inboxConversationPatchSchema.safeParse({}).success).toBe(false);
        expect(inboxConversationPatchSchema.safeParse({ status: "archived" }).success).toBe(false);
        expect(inboxConversationPatchSchema.safeParse({ status: "done" }).success).toBe(true);
    });
});
