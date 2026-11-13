import { describe, expect, it } from "vitest";
import { canAssignRole } from "../../utils/accessControl.js";
import { GYM_ROLES } from "./expectedAccess.js";

const OWNER_ASSIGNABLE = [
    "General Manager",
    "Sales Manager",
    "Sales",
    "Head Coach",
    "Coach",
    "Receptionist",
    "Accountant",
];
const GM_ASSIGNABLE = [
    "Sales Manager",
    "Sales",
    "Head Coach",
    "Coach",
    "Receptionist",
    "Accountant",
];
const GM_TARGETS = ["Sales Manager", "Sales", "Head Coach", "Coach", "Receptionist", "Accountant"];
const SALES_TEAM = ["Sales", "Receptionist"];
const NO_ASSIGN = ["Sales", "Coach", "Receptionist", "Accountant"];

/**
 * Literal hierarchy. Not derived from assignableRolesFor.
 * Self-assignment is covered separately.
 */
function mayAssign(actorRole, targetRole, newRole) {
    if (newRole === "Owner" || targetRole === "Owner") return false;
    if (actorRole === "Owner") return OWNER_ASSIGNABLE.includes(newRole);
    if (actorRole === "General Manager") {
        if (targetRole === "General Manager") return false;
        return GM_ASSIGNABLE.includes(newRole) && GM_TARGETS.includes(targetRole);
    }
    if (actorRole === "Sales Manager") {
        return SALES_TEAM.includes(targetRole) && SALES_TEAM.includes(newRole);
    }
    if (actorRole === "Head Coach") {
        return targetRole === "Coach" && newRole === "Coach";
    }
    return false;
}

function person(role, id) {
    return {
        id,
        role,
        featureAccess: { grants: [], revokes: [] },
        abilities: {},
    };
}

describe("Role assignment matrix", () => {
    it("follows the hierarchy for every actor, target, and new role", () => {
        for (const actorRole of GYM_ROLES) {
            for (const targetRole of GYM_ROLES) {
                for (const newRole of GYM_ROLES) {
                    const result = canAssignRole(person(actorRole, "actor"), person(targetRole, "target"), newRole);
                    const ok = mayAssign(actorRole, targetRole, newRole);
                    expect(result.ok, `${actorRole} → ${targetRole} as ${newRole}`).toBe(ok);
                }
            }
        }
    });

    it("refuses every self role change", () => {
        for (const role of GYM_ROLES) {
            for (const newRole of GYM_ROLES) {
                const result = canAssignRole(person(role, "same"), person(role, "same"), newRole);
                expect(result.ok, `${role} self → ${newRole}`).toBe(false);
                expect(result.status).toBe(403);
            }
        }
    });

    it("lets delegated staff assign like a general manager", () => {
        for (const actorRole of [...NO_ASSIGN, "Sales Manager", "Head Coach"]) {
            const actor = person(actorRole, "actor");
            actor.featureAccess.grants = ["access_control"];
            for (const targetRole of GYM_ROLES) {
                for (const newRole of GYM_ROLES) {
                    const result = canAssignRole(actor, person(targetRole, "target"), newRole);
                    const ok = newRole !== "Owner"
                        && newRole !== "General Manager"
                        && targetRole !== "Owner"
                        && targetRole !== "General Manager"
                        && GM_ASSIGNABLE.includes(newRole)
                        && GM_TARGETS.includes(targetRole);
                    expect(result.ok, `delegated ${actorRole} → ${targetRole} as ${newRole}`).toBe(ok);
                }
            }
        }
    });
});
