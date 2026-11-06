import { describe, it, expect } from "vitest";
import { ACCESS_CATALOG } from "../config/accessCatalog";
import { allowRoles, allowAnyFeature } from "../middleware/accessMiddleware";
import { updateUserAccess } from "../controllers/accessController";
import {
    resolveEffectiveKeys,
    hasAccess,
    isRevoked,
    hasExplicitGrant,
    diffConfirmedFeatures,
    canEditTarget,
    canEditFeature,
    setFeatureEnabled,
    syncLegacyFields,
    memberListDecision,
    groupFeaturesFor,
    featureKeyForAbility,
} from "../utils/accessControl";

describe("access control resolver", () => {
    it("gives a sales rep their role defaults", () => {
        const keys = resolveEffectiveKeys({ role: "Sales", abilities: {}, featureAccess: { grants: [], revokes: [] } });
        expect(keys.has("sales_dashboard")).toBe(true);
        expect(keys.has("comments")).toBe(true);
        expect(keys.has("view_phones")).toBe(true);
        expect(keys.has("accounting_dashboard")).toBe(false);
        expect(keys.has("settings")).toBe(false);
    });

    it("treats a legacy ability turned off as a revoke when no overrides are stored", () => {
        const user = {
            role: "Sales",
            canViewPhones: false,
            abilities: { canCommentOnMembers: false, canRequestAssignment: true },
            featureAccess: { grants: [], revokes: [] },
        };
        expect(hasAccess(user, "comments")).toBe(false);
        expect(hasAccess(user, "view_phones")).toBe(false);
        expect(hasAccess(user, "request_assignment")).toBe(true);
        expect(isRevoked(user, "comments")).toBe(true);
    });

    it("adds grants and removes revokes from the role default", () => {
        const user = {
            role: "Receptionist",
            featureAccess: { grants: ["sales_dashboard"], revokes: ["check_in"] },
        };
        expect(hasAccess(user, "sales_dashboard")).toBe(true);
        expect(hasExplicitGrant(user, "sales_dashboard")).toBe(true);
        expect(hasAccess(user, "check_in")).toBe(false);
        expect(isRevoked(user, "check_in")).toBe(true);
        expect(hasAccess(user, "members")).toBe(true);
    });

    it("refuses an exclusive feature outside its default roles", () => {
        const user = {
            role: "Sales",
            featureAccess: { grants: ["settings", "change_role"], revokes: [] },
        };
        expect(hasAccess(user, "settings")).toBe(false);
        expect(hasExplicitGrant(user, "settings")).toBe(false);
    });

    it("lets the owner change any non-exclusive feature and blocks managers outside their team", () => {
        const owner = { id: "owner-1", role: "Owner" };
        const sales = { _id: "sales-1", role: "Sales" };
        const coach = { _id: "coach-1", role: "Coach" };
        expect(canEditTarget(owner, sales)).toBe(true);
        expect(canEditTarget(owner, owner)).toBe(false);
        expect(canEditTarget({ id: "sm-1", role: "Sales Manager" }, sales)).toBe(true);
        expect(canEditTarget({ id: "sm-1", role: "Sales Manager" }, coach)).toBe(false);
        expect(canEditTarget({ id: "cm-1", role: "Coach Manager" }, coach)).toBe(true);
        expect(canEditTarget({ id: "cm-1", role: "Coach Manager" }, sales)).toBe(false);
    });

    it("stores only the difference and ignores features outside the actor domain", () => {
        const actor = { id: "sm-1", role: "Sales Manager" };
        const target = {
            _id: "sales-1",
            role: "Sales",
            abilities: {},
            canViewPhones: true,
            featureAccess: { grants: [], revokes: [] },
        };
        const requested = ["sales_dashboard", "sales_members", "my_call_center", "request_assignment", "request_takeover", "whatsapp_send", "view_phones", "accounting_dashboard"];
        const diff = diffConfirmedFeatures(actor, target, requested);
        expect(diff.error).toBeUndefined();
        expect(diff.grants).not.toContain("accounting_dashboard");
        expect(diff.revokes).toContain("comments");
        expect(diff.revokes).not.toContain("sales_dashboard");
    });

    it("rejects granting a role-only feature", () => {
        const actor = { id: "owner-1", role: "Owner" };
        const target = { _id: "sales-1", role: "Sales", featureAccess: { grants: [], revokes: [] } };
        const diff = diffConfirmedFeatures(actor, target, ["settings", "sales_dashboard"]);
        expect(diff.error).toMatch(/limited to its default role/i);
    });
});

const owner = { id: "owner-1", role: "Owner" };
const otherOwner = { id: "owner-2", role: "Owner" };
const salesManager = { id: "sm-1", role: "Sales Manager" };
const coachManager = { id: "cm-1", role: "Coach Manager" };
const generalManager = { id: "gm-1", role: "General Manager" };

function defaultsFor(role) {
    return ACCESS_CATALOG.filter((feature) => feature.defaultRoles.includes(role)).map((feature) => feature.key);
}

function blankUser(role, id = `${role}-user`) {
    return {
        id,
        _id: id,
        role,
        abilities: {},
        canViewPhones: true,
        featureAccess: { grants: [], revokes: [] },
        accessOverrides: { add: [], remove: [] },
    };
}

function applyDiff(user, diff) {
    expect(diff.error).toBeUndefined();
    user.featureAccess = { grants: diff.grants, revokes: diff.revokes };
}

function confirm(actor, user, enabledKeys) {
    const diff = diffConfirmedFeatures(actor, user, enabledKeys);
    applyDiff(user, diff);
    return diff;
}

describe("every role can lose a default and gain an outside feature", () => {
    const cases = [
        { role: "Receptionist", actor: owner, revoke: "check_in", grant: "sales_dashboard" },
        { role: "Sales", actor: owner, revoke: "comments", grant: "accounting_dashboard" },
        { role: "Sales", actor: salesManager, revoke: "view_phones", grant: "members" },
        { role: "Sales Manager", actor: owner, revoke: "management", grant: "coach_dashboard" },
        { role: "Accountant", actor: owner, revoke: "refunds", grant: "my_call_center" },
        { role: "Coach", actor: owner, revoke: "coach_notes", grant: "check_in" },
        { role: "Coach Manager", actor: owner, revoke: "coach_team", grant: "packages" },
        { role: "Owner", actor: otherOwner, revoke: "owner_dashboard", grant: "coach_notes" },
    ];

    it.each(cases)("$actor.role turns off $revoke and turns on $grant for $role, then reverses both", ({ role, actor, revoke, grant }) => {
        const user = blankUser(role);
        const defaults = defaultsFor(role);
        expect(defaults).toContain(revoke);
        expect(defaults).not.toContain(grant);
        expect(hasAccess(user, revoke)).toBe(true);
        expect(hasAccess(user, grant)).toBe(false);

        const turned = defaults.filter((key) => key !== revoke);
        turned.push(grant);
        confirm(actor, user, turned);

        expect(hasAccess(user, revoke)).toBe(false);
        expect(isRevoked(user, revoke)).toBe(true);
        expect(user.featureAccess.revokes).toContain(revoke);
        expect(hasAccess(user, grant)).toBe(true);
        expect(hasExplicitGrant(user, grant)).toBe(true);
        expect(user.featureAccess.grants).toContain(grant);
        expect(hasAccess(user, defaults.find((key) => key !== revoke))).toBe(true);

        confirm(actor, user, defaults);
        expect(user.featureAccess.grants).toEqual([]);
        expect(user.featureAccess.revokes).toEqual([]);
        expect(hasAccess(user, revoke)).toBe(true);
        expect(hasAccess(user, grant)).toBe(false);
        expect(hasExplicitGrant(user, grant)).toBe(false);
    });
});

describe("several changes at once", () => {
    it("owner revokes two sales defaults and grants two outside features together", () => {
        const user = blankUser("Sales");
        const enabled = defaultsFor("Sales").filter((key) => key !== "comments" && key !== "whatsapp_send");
        enabled.push("accounting_dashboard", "coach_dashboard");
        confirm(owner, user, enabled);

        expect(hasAccess(user, "comments")).toBe(false);
        expect(hasAccess(user, "whatsapp_send")).toBe(false);
        expect(hasAccess(user, "accounting_dashboard")).toBe(true);
        expect(hasAccess(user, "coach_dashboard")).toBe(true);
        expect(hasAccess(user, "sales_dashboard")).toBe(true);
    });

    it("does not store a grant for a feature the role already has", () => {
        const user = blankUser("Sales");
        const diff = diffConfirmedFeatures(owner, user, [...defaultsFor("Sales"), "sales_dashboard"]);
        expect(diff.grants).not.toContain("sales_dashboard");
        expect(diff.revokes).toEqual([]);
    });

    it("does not store a revoke for a feature the role never had", () => {
        const user = blankUser("Receptionist");
        const diff = diffConfirmedFeatures(owner, user, defaultsFor("Receptionist"));
        expect(diff.revokes).not.toContain("accounting_dashboard");
        expect(diff.grants).not.toContain("accounting_dashboard");
    });
});

describe("who is allowed to edit whom", () => {
    const people = {
        Owner: blankUser("Owner", "owner-target"),
        "General Manager": blankUser("General Manager", "gm-target"),
        "Sales Manager": blankUser("Sales Manager", "sm-target"),
        "Coach Manager": blankUser("Coach Manager", "cm-target"),
        Accountant: blankUser("Accountant", "acc-target"),
        Sales: blankUser("Sales", "sales-target"),
        Receptionist: blankUser("Receptionist", "rec-target"),
        Coach: blankUser("Coach", "coach-target"),
    };

    it("blocks editing yourself", () => {
        expect(canEditTarget(owner, blankUser("Owner", "owner-1"))).toBe(false);
        expect(canEditTarget(salesManager, blankUser("Sales Manager", "sm-1"))).toBe(false);
        expect(canEditTarget(generalManager, blankUser("General Manager", "gm-1"))).toBe(false);
    });

    it("lets a second owner edit another owner", () => {
        expect(canEditTarget(otherOwner, people.Owner)).toBe(true);
    });

    it("limits a sales manager to sales reps and receptionists", () => {
        expect(canEditTarget(salesManager, people.Sales)).toBe(true);
        expect(canEditTarget(salesManager, people.Receptionist)).toBe(true);
        for (const role of ["Owner", "General Manager", "Sales Manager", "Coach Manager", "Accountant", "Coach"]) {
            expect(canEditTarget(salesManager, people[role])).toBe(false);
        }
    });

    it("limits a coach manager to coaches", () => {
        expect(canEditTarget(coachManager, people.Coach)).toBe(true);
        for (const role of ["Owner", "General Manager", "Sales Manager", "Coach Manager", "Accountant", "Sales", "Receptionist"]) {
            expect(canEditTarget(coachManager, people[role])).toBe(false);
        }
    });

    it("lets a general manager edit staff except owners and other general managers", () => {
        expect(canEditTarget(generalManager, people.Sales)).toBe(true);
        expect(canEditTarget(generalManager, people.Owner)).toBe(false);
        expect(canEditTarget(generalManager, people["General Manager"])).toBe(false);
    });

    it("locks features outside a manager's domain and keeps them unchanged", () => {
        const user = blankUser("Sales");
        const enabled = defaultsFor("Sales").filter((key) => key !== "comments");
        enabled.push("members", "accounting_dashboard", "settings");
        const diff = diffConfirmedFeatures(salesManager, user, enabled);
        expect(diff.error).toBeUndefined();
        expect(diff.revokes).toContain("comments");
        expect(diff.grants).toContain("members");
        expect(diff.grants).not.toContain("accounting_dashboard");
        expect(diff.grants).not.toContain("settings");
        applyDiff(user, diff);
        expect(hasAccess(user, "reports")).toBe(true);
        expect(hasAccess(user, "accounting_dashboard")).toBe(false);
        expect(hasAccess(user, "settings")).toBe(false);
    });

    it("a coach manager can revoke a coach default but cannot grant a sales feature", () => {
        const user = blankUser("Coach");
        const enabled = defaultsFor("Coach").filter((key) => key !== "coach_notes");
        enabled.push("sales_dashboard");
        confirm(coachManager, user, enabled);
        expect(hasAccess(user, "coach_notes")).toBe(false);
        expect(hasAccess(user, "sales_dashboard")).toBe(false);
        expect(hasAccess(user, "coach_dashboard")).toBe(true);
    });

    it("a general manager limited to the sales area cannot grant accounting", () => {
        const actor = { ...generalManager, areas: ["sales"] };
        expect(canEditFeature(actor, ACCESS_CATALOG.find((feature) => feature.key === "accounting_dashboard"))).toBe(false);
        expect(canEditFeature(actor, ACCESS_CATALOG.find((feature) => feature.key === "comments"))).toBe(true);
        expect(canEditFeature(generalManager, ACCESS_CATALOG.find((feature) => feature.key === "settings"))).toBe(false);
    });

    it("shows locked rows when the actor cannot change that feature", () => {
        const sales = blankUser("Sales");
        const groups = groupFeaturesFor(salesManager, sales);
        const flat = groups.flatMap((group) => group.features);
        const comments = flat.find((feature) => feature.key === "comments");
        const accounting = flat.find((feature) => feature.key === "accounting_dashboard");
        const settings = flat.find((feature) => feature.key === "settings");
        expect(comments.locked).toBe(false);
        expect(comments.enabled).toBe(true);
        expect(accounting.locked).toBe(true);
        expect(settings.locked).toBe(true);
        expect(settings.lockReason).toMatch(/role only|cannot change|sales features/i);
    });
});

describe("edge cases", () => {
    it("rejects an unknown feature and does not describe a partial save", () => {
        const diff = diffConfirmedFeatures(owner, blankUser("Sales"), ["sales_dashboard", "not_a_feature"]);
        expect(diff.error).toMatch(/Unknown feature: not_a_feature/);
        expect(diff.grants).toBeUndefined();
    });

    it("rejects a confirm body that is not a list of keys before touching the database", async () => {
        const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await updateUserAccess({ user: owner, body: { features: "sales_dashboard" } }, res);
        expect(res.statusCode).toBe(400);
        await updateUserAccess({ user: owner, body: { features: ["ok", 12] } }, res);
        expect(res.statusCode).toBe(400);
        await updateUserAccess({ user: owner, body: {} }, res);
        expect(res.statusCode).toBe(400);
    });

    it("an empty confirm list removes every default the owner is allowed to change", () => {
        const user = blankUser("Receptionist");
        confirm(owner, user, []);
        for (const key of defaultsFor("Receptionist")) {
            expect(hasAccess(user, key)).toBe(false);
        }
        expect(hasAccess(user, "settings")).toBe(false);
    });

    it("refuses to give settings, change role, or access control to a role that does not have them", () => {
        for (const key of ["settings", "change_role", "access_control"]) {
            const diff = diffConfirmedFeatures(owner, blankUser("Accountant"), [key]);
            expect(diff.error).toMatch(/limited to its default role/i);
        }
    });

    it("still allows an owner to revoke an exclusive feature from someone who has it", () => {
        const user = blankUser("Sales Manager", "sm-target");
        expect(hasAccess(user, "access_control")).toBe(true);
        const enabled = defaultsFor("Sales Manager").filter((key) => key !== "access_control");
        confirm(owner, user, enabled);
        expect(hasAccess(user, "access_control")).toBe(false);
        expect(isRevoked(user, "access_control")).toBe(true);
    });

    it("keeps a legacy ability that was turned off, then lets a later save replace it", () => {
        const user = blankUser("Sales");
        user.abilities = { canCommentOnMembers: false, canRequestAssignment: false, canRequestTakeover: true, canSendWhatsAppTemplates: true };
        user.canViewPhones = false;
        expect(hasAccess(user, "comments")).toBe(false);
        expect(hasAccess(user, "request_assignment")).toBe(false);
        expect(hasAccess(user, "coach_notes")).toBe(false);
        expect(isRevoked(user, "view_phones")).toBe(true);
        expect(hasAccess(user, "sales_dashboard")).toBe(true);

        confirm(owner, user, defaultsFor("Sales"));
        syncLegacyFields(user);
        expect(hasAccess(user, "comments")).toBe(true);
        expect(hasAccess(user, "view_phones")).toBe(true);
        expect(hasAccess(user, "request_assignment")).toBe(true);
        expect(user.abilities.canCommentOnMembers).toBe(true);
        expect(user.abilities.canRequestAssignment).toBe(true);
        expect(user.canViewPhones).toBe(true);

        const leftOff = blankUser("Sales", "sales-left-off");
        leftOff.abilities = { canCommentOnMembers: false };
        const keptOff = defaultsFor("Sales").filter((key) => key !== "comments");
        confirm(owner, leftOff, keptOff);
        syncLegacyFields(leftOff);
        expect(hasAccess(leftOff, "comments")).toBe(false);
        expect(leftOff.abilities.canCommentOnMembers).toBe(false);
        expect(hasAccess(leftOff, "sales_dashboard")).toBe(true);
    });

    it("ignores a stale ability flag once grants or revokes have been saved", () => {
        const user = blankUser("Sales");
        user.abilities = { canCommentOnMembers: false };
        user.featureAccess = { grants: ["accounting_dashboard"], revokes: [] };
        expect(hasAccess(user, "comments")).toBe(true);
        expect(hasAccess(user, "accounting_dashboard")).toBe(true);
    });

    it("maps the old coach comment toggle onto coach notes and the sales toggle onto comments", () => {
        expect(featureKeyForAbility("Coach", "canCommentOnMembers")).toBe("coach_notes");
        expect(featureKeyForAbility("Sales", "canCommentOnMembers")).toBe("comments");
        const coach = blankUser("Coach");
        setFeatureEnabled(coach, "coach_notes", false);
        setFeatureEnabled(coach, "check_in", true);
        expect(hasAccess(coach, "coach_notes")).toBe(false);
        expect(hasExplicitGrant(coach, "check_in")).toBe(true);
        setFeatureEnabled(coach, "coach_notes", true);
        setFeatureEnabled(coach, "check_in", false);
        expect(coach.featureAccess.revokes).not.toContain("coach_notes");
        expect(coach.featureAccess.grants).not.toContain("check_in");
        expect(hasAccess(coach, "coach_notes")).toBe(true);
        expect(hasAccess(coach, "check_in")).toBe(false);
    });

    it("hides the member list when that feature is revoked and opens it when it is granted", () => {
        const sales = blankUser("Sales");
        sales.featureAccess = { grants: [], revokes: ["sales_members"] };
        expect(memberListDecision(sales)).toBe("deny");

        const coach = blankUser("Coach");
        coach.featureAccess = { grants: ["members"], revokes: [] };
        expect(memberListDecision(coach)).toBe("all");

        const receptionist = blankUser("Receptionist");
        receptionist.featureAccess = { grants: [], revokes: ["members"] };
        expect(memberListDecision(receptionist)).toBe("deny");
        receptionist.featureAccess = { grants: [], revokes: [] };
        expect(memberListDecision(receptionist)).toBe("all");
    });

    it("drops a feature whose area was removed, and adds an area that was granted", () => {
        const sales = blankUser("Sales");
        sales.accessOverrides = { add: [], remove: ["checkin"] };
        const withoutCheckin = resolveEffectiveKeys(sales, { roleAccess: null, planFeatures: null });
        expect(withoutCheckin.has("check_in")).toBe(false);
        expect(withoutCheckin.has("sales_dashboard")).toBe(true);

        sales.accessOverrides = { add: ["accounting"], remove: [] };
        const withAccounting = resolveEffectiveKeys(sales, { roleAccess: null, planFeatures: null });
        expect(withAccounting.has("accounting_dashboard")).toBe(true);
        expect(withAccounting.has("refunds")).toBe(true);

        const planned = resolveEffectiveKeys(sales, { roleAccess: null, planFeatures: ["members"] });
        expect(planned.has("accounting_dashboard")).toBe(false);
    });

    it("a saved role checklist replaces that role's defaults", () => {
        const sales = blankUser("Sales");
        const keys = resolveEffectiveKeys(sales, {
            roleAccess: { Sales: ["sales"] },
            planFeatures: null,
        });
        expect(keys.has("sales_dashboard")).toBe(true);
        expect(keys.has("check_in")).toBe(false);
        expect(keys.has("reports")).toBe(false);
    });

    it("a general manager has every feature except gym settings, and a revoke still sticks", () => {
        const gm = blankUser("General Manager");
        expect(hasAccess(gm, "settings")).toBe(false);
        expect(hasAccess(gm, "accounting_dashboard")).toBe(true);
        expect(hasAccess(gm, "coach_notes")).toBe(true);
        gm.featureAccess = { grants: ["settings"], revokes: ["reports"] };
        expect(hasAccess(gm, "settings")).toBe(false);
        expect(hasAccess(gm, "reports")).toBe(false);
        const withContext = resolveEffectiveKeys(gm, { roleAccess: null, planFeatures: null });
        expect(withContext.has("reports")).toBe(false);
        expect(withContext.has("settings")).toBe(false);
    });
});

describe("route gates", () => {
    function run(middleware, user, extra = {}) {
        const req = { user, tenant: extra.tenant || null, planFeatures: extra.planFeatures || null };
        const res = {
            statusCode: 200,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        let nexted = false;
        middleware(req, res, () => { nexted = true; });
        return { nexted, statusCode: res.statusCode, body: res.body };
    }

    it("lets a matching role through and blocks a role that was not granted the feature", () => {
        const open = run(allowRoles("check_in", "Receptionist", "Sales"), blankUser("Receptionist"));
        expect(open.nexted).toBe(true);
        const closed = run(allowRoles("check_in", "Receptionist", "Sales"), blankUser("Coach"));
        expect(closed.nexted).toBe(false);
        expect(closed.statusCode).toBe(403);
    });

    it("a revoke blocks the role, and a grant lets a different role through", () => {
        const revoked = blankUser("Sales");
        revoked.featureAccess.revokes = ["check_in"];
        const denied = run(allowRoles("check_in", "Sales", "Receptionist"), revoked);
        expect(denied.nexted).toBe(false);
        expect(denied.body.feature).toBe("check_in");

        const granted = blankUser("Coach");
        granted.featureAccess.grants = ["check_in"];
        const allowed = run(allowRoles("check_in", "Receptionist", "Sales"), granted);
        expect(allowed.nexted).toBe(true);
    });

    it("an area removal blocks the route even when the role is still on the allow list", () => {
        const sales = blankUser("Sales");
        sales.accessOverrides = { add: [], remove: ["checkin"] };
        const result = run(allowRoles("check_in", "Sales", "Receptionist"), sales);
        expect(result.nexted).toBe(false);
        expect(result.statusCode).toBe(403);
    });

    it("a feature revoke wins over an area that was added", () => {
        const coach = blankUser("Coach");
        coach.featureAccess.revokes = ["check_in"];
        coach.accessOverrides = { add: ["checkin"], remove: [] };
        const result = run(allowRoles("check_in", "Coach"), coach);
        expect(result.nexted).toBe(false);
    });

    it("requires one of the listed features for assignment or takeover", () => {
        const bothOff = blankUser("Sales");
        bothOff.featureAccess.revokes = ["request_assignment", "request_takeover"];
        expect(run(allowAnyFeature(["request_assignment", "request_takeover"], "Sales"), bothOff).nexted).toBe(false);

        const takeoverOnly = blankUser("Sales", "sales-2");
        takeoverOnly.featureAccess.revokes = ["request_assignment"];
        expect(run(allowAnyFeature(["request_assignment", "request_takeover"], "Sales"), takeoverOnly).nexted).toBe(true);
    });

    it("rejects a request with no signed-in user", () => {
        const result = run(allowRoles("members", "Owner"), null);
        expect(result.statusCode).toBe(401);
        expect(result.nexted).toBe(false);
    });
});
