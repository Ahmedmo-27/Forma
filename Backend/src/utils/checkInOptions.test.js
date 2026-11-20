import { describe, expect, it } from "vitest";
import { checkInOptions, normalizeCheckInType, ptSessionsLeft } from "./checkInOptions";

const NOW = new Date(2026, 10, 20, 12, 0, 0);
const DAY_START = new Date(2026, 10, 20, 0, 0, 0);

function sub(start, end, extra = {}) {
    return { startDate: start, endDate: end, pricePaid: 1000, ...extra };
}

function member(extra = {}) {
    return {
        isMember: true,
        isBlocked: false,
        status: "active",
        subscriptions: [sub(new Date(2026, 9, 1), new Date(2026, 11, 1))],
        couch_subscription_status: null,
        PT_sessions: 0,
        used_PT_sessions: 0,
        ...extra,
    };
}

const pt = (extra = {}) => ({
    couch_subscription_status: "active",
    PT_sessions: 10,
    used_PT_sessions: 4,
    PT_sessions_expDate: new Date(2027, 0, 1),
    ...extra,
});

describe("normalizeCheckInType", () => {
    it("accepts gym and pt in any case and rejects the rest", () => {
        expect(normalizeCheckInType("gym")).toBe("gym");
        expect(normalizeCheckInType(" PT ")).toBe("pt");
        expect(normalizeCheckInType("other")).toBeNull();
        expect(normalizeCheckInType(undefined)).toBeNull();
        expect(normalizeCheckInType("")).toBeNull();
    });
});

describe("checkInOptions", () => {
    it("offers only the gym for a regular member", () => {
        expect(checkInOptions(member(), { now: NOW, dayStart: DAY_START })).toMatchObject({ gym: true, pt: false });
    });

    it("offers both when a member has an active gym package and PT sessions left", () => {
        const options = checkInOptions(member(pt()), { now: NOW, dayStart: DAY_START });
        expect(options).toMatchObject({ gym: true, pt: true, ptSessionsLeft: 6 });
    });

    it("offers only PT when the gym package has ended", () => {
        const expired = member(pt({ subscriptions: [sub(new Date(2026, 0, 1), new Date(2026, 1, 1))] }));
        expect(checkInOptions(expired, { now: NOW, dayStart: DAY_START })).toMatchObject({ gym: false, pt: true });
    });

    it("ignores refunded and cancelled gym packages", () => {
        const refunded = member(pt({ subscriptions: [sub(new Date(2026, 9, 1), new Date(2026, 11, 1), { refunded: true })] }));
        const cancelled = member(pt({ subscriptions: [sub(new Date(2026, 9, 1), new Date(2026, 11, 1), { cancelled: true })] }));
        expect(checkInOptions(refunded, { now: NOW, dayStart: DAY_START }).gym).toBe(false);
        expect(checkInOptions(cancelled, { now: NOW, dayStart: DAY_START }).gym).toBe(false);
    });

    it("drops PT when no sessions are left, the coach status is not active, or the pack expired", () => {
        expect(checkInOptions(member(pt({ used_PT_sessions: 10 })), { now: NOW, dayStart: DAY_START }).pt).toBe(false);
        expect(checkInOptions(member(pt({ couch_subscription_status: "expired" })), { now: NOW, dayStart: DAY_START }).pt).toBe(false);
        const expired = member(pt({ PT_sessions_expDate: new Date(2026, 10, 19) }));
        expect(checkInOptions(expired, { now: NOW, dayStart: DAY_START })).toMatchObject({ pt: false, ptExpired: true });
    });

    it("keeps PT valid through its last day", () => {
        const lastDay = member(pt({ PT_sessions_expDate: new Date(2026, 10, 20, 9, 0, 0) }));
        expect(checkInOptions(lastDay, { now: NOW, dayStart: DAY_START }).pt).toBe(true);
    });

    it("turns PT off when the plan does not include PT tracking", () => {
        const options = checkInOptions(member(pt()), { now: NOW, dayStart: DAY_START, ptEnabled: false });
        expect(options).toMatchObject({ gym: true, pt: false });
    });

    it("offers nothing to a blocked member or a guest", () => {
        expect(checkInOptions(member(pt({ isBlocked: true })), { now: NOW, dayStart: DAY_START })).toMatchObject({ gym: false, pt: false });
        expect(checkInOptions(member({ isMember: false, subscriptions: [] }), { now: NOW, dayStart: DAY_START }).gym).toBe(false);
    });

    it("counts remaining sessions without going negative", () => {
        expect(ptSessionsLeft({ PT_sessions: 3, used_PT_sessions: 5 })).toBe(0);
        expect(ptSessionsLeft({})).toBe(0);
    });
});
