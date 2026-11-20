import { describe, it, expect, vi, beforeEach } from "vitest";
import Package from "../models/Package";
import Member from "../models/Member";
import User from "../models/User";
import { getOnboardingChecklist } from "../services/onboardingService";

const plan = { features: ["members", "packages", "whatsapp"] };

function stubData({ hasPackage = null, hasPerson = null, hasMembership = null, staff = 1 } = {}) {
    vi.spyOn(Package, "exists").mockResolvedValue(hasPackage);
    vi.spyOn(Member, "exists").mockImplementation((filter) =>
        Promise.resolve(filter?.isMember ? hasMembership : hasPerson)
    );
    vi.spyOn(User, "countDocuments").mockResolvedValue(staff);
}

describe("onboarding checklist", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("starts with nothing done for a brand-new gym", async () => {
        stubData();
        const result = await getOnboardingChecklist({ settings: {} }, plan);
        expect(result.steps.map((s) => s.key)).toEqual([
            "branding",
            "packages",
            "first_member",
            "first_membership",
            "invite_staff",
            "whatsapp",
            "billing_profile",
        ]);
        expect(result.completed).toBe(0);
        expect(result.allDone).toBe(false);
        expect(result.dismissedAt).toBeNull();
    });

    it("ticks steps off from live data", async () => {
        stubData({ hasPackage: { _id: 1 }, hasPerson: { _id: 2 }, hasMembership: null, staff: 3 });
        const tenant = {
            settings: { branding: { logoKey: "t/logo.png" }, whatsapp: { phoneNumberId: "1", accessToken: "enc" } },
            billingProfile: { legalName: "Nile Fitness LLC" },
        };
        const result = await getOnboardingChecklist(tenant, plan);
        const done = Object.fromEntries(result.steps.map((s) => [s.key, s.done]));
        expect(done).toEqual({
            branding: true,
            packages: true,
            first_member: true,
            first_membership: false,
            invite_staff: true,
            whatsapp: true,
            billing_profile: true,
        });
        expect(result.completed).toBe(6);
    });

    it("skips the WhatsApp step when the plan has no WhatsApp", async () => {
        stubData();
        const result = await getOnboardingChecklist({ settings: {} }, { features: ["members"] });
        expect(result.steps.some((s) => s.key === "whatsapp")).toBe(false);
        expect(result.total).toBe(6);
    });

    it("passes through the owner's dismissal", async () => {
        stubData();
        const dismissedAt = new Date("2026-11-01T00:00:00Z");
        const result = await getOnboardingChecklist({ settings: { onboarding: { dismissedAt } } }, plan);
        expect(result.dismissedAt).toBe(dismissedAt);
    });
});
