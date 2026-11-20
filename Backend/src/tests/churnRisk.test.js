import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { scoreTenant } = require("../services/churnRiskService");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00.000Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

function score(tenant, extra = {}) {
    return scoreTenant({
        tenant: { status: "active", createdAt: daysAgo(120), lastActivityAt: daysAgo(1), ...tenant },
        memberCount: 200,
        staffCount: 5,
        activity: null,
        now: NOW,
        ...extra,
    });
}

describe("churn risk scoring", () => {
    it("a busy, healthy gym has no signals", () => {
        const result = score({}, { activity: { recentCheckIns: 300, priorCheckIns: 310, termsEnded: 10, termsRenewed: 8 } });
        expect(result).toMatchObject({ riskScore: 0, level: "low", healthScore: 100, signals: [] });
    });

    it("flags long inactivity as medium risk with a call-the-owner action", () => {
        const result = score({ lastActivityAt: daysAgo(20) });
        expect(result.signals.map((s) => s.key)).toContain("inactive");
        expect(result.level).toBe("medium");
        expect(result.suggestedActions[0]).toMatch(/Call the owner/);
    });

    it("stacks past due, inactivity and an empty gym into high risk, highest weight first", () => {
        const result = score(
            { status: "past_due", lastActivityAt: daysAgo(30), dunning: { graceEndsAt: new Date("2026-11-22T00:00:00Z") } },
            { memberCount: 0, staffCount: 1 }
        );
        expect(result.level).toBe("high");
        expect(result.riskScore).toBe(100);
        expect(result.signals[0]).toMatchObject({ key: "past_due", label: "Payment overdue. Suspends on 2026-11-22." });
        expect(result.signals.map((s) => s.key)).toEqual(
            expect.arrayContaining(["inactive", "no_members", "owner_only", "low_health"])
        );
    });

    it("detects a week-over-week check-in drop and weak renewals from BI snapshots", () => {
        const result = score({}, { activity: { recentCheckIns: 40, priorCheckIns: 200, termsEnded: 10, termsRenewed: 2 } });
        const keys = result.signals.map((s) => s.key);
        expect(keys).toEqual(["checkins_drop", "low_renewals"]);
        expect(result.signals[0].label).toContain("down 80%");
    });

    it("ignores check-in drops on tiny volumes", () => {
        const result = score({}, { activity: { recentCheckIns: 2, priorCheckIns: 10, termsEnded: 0, termsRenewed: 0 } });
        expect(result.signals).toEqual([]);
    });

    it("flags a trial that ends soon with little usage, and a gym that never became active", () => {
        const trial = score({ status: "trial", trialEndsAt: new Date(NOW.getTime() + 2 * DAY) }, { memberCount: 5 });
        expect(trial.signals.map((s) => s.key)).toContain("trial_ending");

        const neverActive = score({ lastActivityAt: null, createdAt: daysAgo(10) });
        expect(neverActive.signals.map((s) => s.key)).toContain("never_active");

        const brandNew = score({ lastActivityAt: null, createdAt: daysAgo(2) }, { memberCount: 0 });
        expect(brandNew.signals.map((s) => s.key)).not.toContain("never_active");
        expect(brandNew.signals.map((s) => s.key)).not.toContain("no_members");
    });
});
