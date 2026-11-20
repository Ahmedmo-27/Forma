import { createRequire } from "module";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const TenantMetricSnapshot = require("../models/TenantMetricSnapshot");
const ownerMail = require("../services/ownerMail");
const mailer = require("../services/mailer");
const { runOwnerDigests, isoWeekKey, isDigestDue, sumDays } = require("../services/ownerDigest");

// Monday 2026-11-16 08:30 in Cairo (UTC+2).
const MONDAY_MORNING = new Date("2026-11-16T06:30:00.000Z");

function tenantDoc(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        name: "Iron Gym",
        slug: "iron",
        status: "active",
        ownerUserId: { email: "owner@iron.test", name: "Owner" },
        settings: { locale: { timezone: "Africa/Cairo" }, notifications: { weeklyDigest: true } },
        ...overrides,
    };
}

describe("owner weekly digest", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("builds ISO week keys across year boundaries", () => {
        expect(isoWeekKey("2026-11-16")).toBe("2026-W47");
        expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
        expect(isoWeekKey("2021-01-04")).toBe("2021-W01");
    });

    it("is due only on Monday from 08:00 in the gym's timezone", () => {
        expect(isDigestDue(MONDAY_MORNING, "Africa/Cairo")).toBe(true);
        expect(isDigestDue(new Date("2026-11-16T05:30:00.000Z"), "Africa/Cairo")).toBe(false);
        expect(isDigestDue(new Date("2026-11-17T06:30:00.000Z"), "Africa/Cairo")).toBe(false);
    });

    it("sums daily metrics and treats missing values as zero", () => {
        const totals = sumDays([
            { metrics: { newJoins: 2, checkIns: 40, membershipSalesPiasters: 100000 } },
            { metrics: { newJoins: 1, refundsPiasters: 5000 } },
            { metrics: null },
        ]);
        expect(totals).toMatchObject({ newJoins: 3, checkIns: 40, membershipSalesPiasters: 100000, refundsPiasters: 5000, churnEvents: 0 });
    });

    it("sends one digest per gym deduped by ISO week, with net revenue", async () => {
        const tenant = tenantDoc();
        vi.spyOn(Tenant, "find").mockReturnValue({ select: () => Promise.resolve([tenant]) });
        vi.spyOn(TenantMetricSnapshot, "find").mockReturnValue({
            select: () => ({
                lean: () => Promise.resolve([
                    { localDate: "2026-11-10", metrics: { membershipSalesPiasters: 300000, refundsPiasters: 50000, newJoins: 2, termsEnded: 4, termsRenewed: 3 } },
                    { localDate: "2026-11-11", metrics: { ptSalesPiasters: 100000, checkIns: 25 } },
                ]),
            }),
        });
        vi.spyOn(Member, "countDocuments").mockResolvedValue(120);
        vi.spyOn(Member, "aggregate").mockResolvedValue([{ n: 6 }]);
        const reminder = vi.spyOn(ownerMail, "sendReminder").mockResolvedValue(true);
        const send = vi.spyOn(mailer, "sendOwnerDigest").mockResolvedValue({});

        const result = await runOwnerDigests(MONDAY_MORNING);

        expect(result).toEqual({ scanned: 1, sent: 1 });
        const args = reminder.mock.calls[0][0];
        expect(args).toMatchObject({ kind: "owner_weekly_digest", window: "2026-W47" });

        await args.send({ email: "owner@iron.test", name: "Owner" });
        const mail = send.mock.calls[0][0];
        expect(mail.periodLabel).toBe("2026-11-09 to 2026-11-15");
        const byLabel = Object.fromEntries(mail.metrics.map((m) => [m.label, m.value]));
        expect(byLabel["New members"]).toBe(2);
        expect(byLabel["Renewals"]).toBe("3 of 4 ending (75%)");
        expect(byLabel["Memberships ending in the next 7 days"]).toBe(6);
        expect(String(byLabel["Revenue collected (net of refunds)"])).toContain("3,500");
    });

    it("skips gyms where it is not Monday morning locally", async () => {
        vi.spyOn(Tenant, "find").mockReturnValue({
            select: () => Promise.resolve([tenantDoc({ settings: { locale: { timezone: "America/Los_Angeles" } } })]),
        });
        const reminder = vi.spyOn(ownerMail, "sendReminder").mockResolvedValue(true);

        const result = await runOwnerDigests(MONDAY_MORNING);

        expect(result).toEqual({ scanned: 1, sent: 0 });
        expect(reminder).not.toHaveBeenCalled();
    });
});
