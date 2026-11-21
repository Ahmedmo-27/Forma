import { describe, it, expect } from "vitest";
import { redactMemberForViewer } from "./memberPrivacy.js";

const member = {
    _id: "m1",
    name: "Alex",
    phones: "01000000001",
    assignedSales: { _id: "sales-1", name: "Sam" },
    current_couch: { _id: "coach-1", name: "Chris" },
};

describe("redactMemberForViewer", () => {
    it("hides phones from Sales when the member is not on their book", () => {
        const out = redactMemberForViewer(member, {
            id: "sales-other",
            role: "Sales",
            featureAccess: { grants: [], revokes: [] },
        });
        expect(out.phones).toBeNull();
    });

    it("keeps phones for Sales when the member is assigned to them", () => {
        const out = redactMemberForViewer(member, {
            id: "sales-1",
            role: "Sales",
            featureAccess: { grants: [], revokes: [] },
        });
        expect(out.phones).toBe("01000000001");
    });

    it("hides phones from Receptionist when view_phones is revoked", () => {
        const out = redactMemberForViewer(member, {
            id: "desk-1",
            role: "Receptionist",
            canViewPhones: false,
            featureAccess: { grants: [], revokes: ["view_phones"] },
        });
        expect(out.phones).toBe("hidden");
    });

    it("keeps phones for Receptionist with view_phones", () => {
        const out = redactMemberForViewer(member, {
            id: "desk-1",
            role: "Receptionist",
            canViewPhones: true,
            featureAccess: { grants: [], revokes: [] },
        });
        expect(out.phones).toBe("01000000001");
    });

    it("hides phones from Coach when the member is not their trainee", () => {
        const out = redactMemberForViewer(member, {
            id: "coach-other",
            role: "Coach",
            featureAccess: { grants: [], revokes: [] },
        });
        expect(out.phones).toBeNull();
    });

    it("keeps phones for Coach when the member is assigned to them", () => {
        const out = redactMemberForViewer(member, {
            id: "coach-1",
            role: "Coach",
            featureAccess: { grants: [], revokes: [] },
        });
        expect(out.phones).toBe("01000000001");
    });
});
