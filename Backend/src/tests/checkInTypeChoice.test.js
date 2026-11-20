import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Member from "../models/Member";
import User from "../models/User";
import { checkInMember } from "../controllers/memberController";

const DAY = 86400000;

describe("Front desk check-in: gym or PT", () => {
    const userId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId().toString();

    const makeReqRes = ({ memberId = "S100", role = "Receptionist", body = {} } = {}) => {
        const req = { params: { memberId }, body, user: { id: userId, tenantId, role } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
        return { req, res };
    };

    const activeSub = () => ({
        packageSnapshot: { name: "3 Month Gym" },
        startDate: new Date(Date.now() - 5 * DAY),
        endDate: new Date(Date.now() + 30 * DAY),
        pricePaid: 1000,
    });

    const baseMember = (extra = {}) => ({
        _id: new mongoose.Types.ObjectId(),
        systemId: 100,
        memberId: 5,
        name: "Both Packages",
        status: "active",
        isMember: true,
        isBlocked: false,
        subscriptions: [activeSub()],
        couch_subscription_status: "active",
        current_couch: new mongoose.Types.ObjectId(),
        PT_sessions: 10,
        used_PT_sessions: 4,
        PT_sessions_expDate: new Date(Date.now() + 30 * DAY),
        userlog: [],
        ...extra,
    });

    const leanOnce = (value) => ({ lean: vi.fn().mockResolvedValue(value) });

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("never lets a coach check in the regular gym", async () => {
        for (const role of ["Coach", "Head Coach"]) {
            const { req, res } = makeReqRes({ role });
            const update = vi.spyOn(Member, "findOneAndUpdate");
            await checkInMember(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "COACH_GYM_CHECKIN_FORBIDDEN" }));
            expect(update).not.toHaveBeenCalled();
        }
    });

    it("rejects an unknown check-in type", async () => {
        const { req, res } = makeReqRes({ body: { type: "sauna" } });
        await checkInMember(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("asks what the member is attending when both a gym package and PT sessions are active", async () => {
        const { req, res } = makeReqRes();
        const update = vi.spyOn(Member, "findOneAndUpdate").mockReturnValue(leanOnce(null));
        vi.spyOn(Member, "findOne").mockReturnValue({ populate: vi.fn().mockResolvedValue(baseMember()) });
        vi.spyOn(User, "findById").mockReturnValue({ select: () => leanOnce({ name: "Coach Sara" }) });

        await checkInMember(req, res);

        expect(update.mock.calls[0][0].$nor).toBeTruthy();
        expect(res.status).toHaveBeenCalledWith(409);
        const body = res.json.mock.calls[0][0];
        expect(body).toMatchObject({
            code: "CHECKIN_TYPE_REQUIRED",
            options: ["gym", "pt"],
            member: { name: "Both Packages", gymPackage: "3 Month Gym", ptSessionsLeft: 6, coachName: "Coach Sara" },
        });
        // Nothing was recorded while waiting for the answer.
        expect(update).toHaveBeenCalledTimes(1);
    });

    it("checks in a PT session straight away when the gym package is not active", async () => {
        const { req, res } = makeReqRes();
        const ptOnly = baseMember({ subscriptions: [] });
        const update = vi.spyOn(Member, "findOneAndUpdate")
            .mockReturnValueOnce(leanOnce(null))
            .mockReturnValueOnce(leanOnce({ name: "Both Packages", systemId: 100, status: "active", PT_sessions: 10, used_PT_sessions: 5 }));
        vi.spyOn(Member, "findOne").mockReturnValue({ populate: vi.fn().mockResolvedValue(ptOnly) });

        await checkInMember(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkInType: "pt", ptSessionsLeft: 5 }));
        const [, change] = update.mock.calls[1];
        expect(change.$inc).toEqual({ used_PT_sessions: 1 });
        expect(change.$push.userlog).toMatchObject({ type: "pt-session" });
    });

    it("records a PT session when the desk picks PT", async () => {
        const { req, res } = makeReqRes({ body: { type: "pt", locationId: undefined } });
        const update = vi.spyOn(Member, "findOneAndUpdate")
            .mockReturnValue(leanOnce({ name: "Both Packages", systemId: 100, status: "active", PT_sessions: 10, used_PT_sessions: 5 }));

        await checkInMember(req, res);

        expect(update).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkInType: "pt" }));
    });

    it("explains why a PT check-in failed", async () => {
        const cases = [
            [{ couch_subscription_status: "expired" }, 400, "no active PT package"],
            [{ used_PT_sessions: 10 }, 400, "no PT sessions left"],
            [{ PT_sessions_expDate: new Date(Date.now() - 3 * DAY) }, 400, "has expired"],
            [{ userlog: [{ type: "pt-session", createdAt: new Date() }] }, 400, "already has a PT session check-in today"],
            [{ isBlocked: true }, 403, "blocked"],
        ];
        for (const [extra, status, text] of cases) {
            const { req, res } = makeReqRes({ body: { type: "pt" } });
            vi.spyOn(Member, "findOneAndUpdate").mockReturnValue(leanOnce(null));
            vi.spyOn(Member, "findOne").mockReturnValue({
                select: () => leanOnce(baseMember(extra)),
            });
            await checkInMember(req, res);
            expect(res.status, text).toHaveBeenCalledWith(status);
            expect(res.json.mock.calls[0][0].message, text).toContain(text);
        }
    });

    it("keeps the gym fast path for a regular member and when the desk picks gym", async () => {
        const { req, res } = makeReqRes();
        const update = vi.spyOn(Member, "findOneAndUpdate")
            .mockReturnValue(leanOnce({ name: "Regular", systemId: 7, status: "active", subscriptions: [activeSub()] }));
        await checkInMember(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkInType: "gym" }));

        const picked = makeReqRes({ body: { type: "gym" } });
        await checkInMember(picked.req, picked.res);
        expect(picked.res.status).toHaveBeenCalledWith(201);
        // An explicit gym choice does not exclude members who also hold PT sessions.
        expect(update.mock.calls[1][0].$nor).toBeUndefined();
    });
});
