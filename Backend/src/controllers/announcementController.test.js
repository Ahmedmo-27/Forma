import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Announcement from "../models/Announcement";
import User from "../models/User";
import {
    listAnnouncements,
    dismissAnnouncement,
    dismissAllAnnouncements,
} from "./announcementController";

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
    };
    return res;
}

function chainFind(rows) {
    return {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(rows),
    };
}

describe("announcementController (tenant What's New)", () => {
    const tenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const featureId = new mongoose.Types.ObjectId();
    const planOnlyId = new mongoose.Types.ObjectId();
    const roleOnlyId = new mongoose.Types.ObjectId();

    const rows = [
        {
            _id: featureId,
            title: "New BI charts",
            message: "Platinum owners get BI",
            type: "feature",
            startDate: new Date("2026-01-01"),
            target: { type: "plan", targetPlanKeys: ["platinum"], targetRoles: ["Owner"] },
        },
        {
            _id: planOnlyId,
            title: "Gold CRM tip",
            message: "Sales CRM tips",
            type: "info",
            startDate: new Date("2026-01-02"),
            target: { type: "plan", targetPlanKeys: ["gold"], targetRoles: [] },
        },
        {
            _id: roleOnlyId,
            title: "Coach tip",
            message: "PT tracking tip",
            type: "info",
            startDate: new Date("2026-01-03"),
            target: { type: "all", targetRoles: ["Coach"] },
        },
    ];

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Announcement, "find").mockReturnValue(chainFind(rows));
    });

    it("GET returns only matching plan+role items and marks dismissed", async () => {
        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    dismissedAnnouncementIds: [featureId],
                }),
            }),
        });

        const req = {
            user: { id: String(userId), role: "Owner", tenantId: String(tenantId) },
            plan: { key: "platinum" },
            query: { includeDismissed: "true" },
        };
        const res = mockRes();

        await listAnnouncements(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.announcements.map((a) => String(a._id))).toEqual([String(featureId)]);
        expect(res.body.announcements[0].dismissed).toBe(true);
        expect(res.body.unreadCount).toBe(0);
    });

    it("GET excludes dismissed by default", async () => {
        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    dismissedAnnouncementIds: [],
                }),
            }),
        });

        const req = {
            user: { id: String(userId), role: "Owner", tenantId: String(tenantId) },
            plan: { key: "platinum" },
            query: {},
        };
        const res = mockRes();

        await listAnnouncements(req, res);

        expect(res.body.announcements).toHaveLength(1);
        expect(String(res.body.announcements[0]._id)).toBe(String(featureId));
        expect(res.body.announcements[0].dismissed).toBe(false);
        expect(res.body.unreadCount).toBe(1);
    });

    it("POST dismiss is idempotent", async () => {
        const userDoc = {
            dismissedAnnouncementIds: [featureId],
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockResolvedValue(userDoc),
        });

        const req = {
            params: { id: String(featureId) },
            user: { id: String(userId), role: "Owner", tenantId: String(tenantId) },
            plan: { key: "platinum" },
        };
        const res = mockRes();

        await dismissAnnouncement(req, res);

        expect(res.body.ok).toBe(true);
        expect(userDoc.save).toHaveBeenCalled();
        expect(userDoc.dismissedAnnouncementIds.map(String)).toEqual([String(featureId)]);
    });

    it("POST dismiss-all dismisses all currently visible items", async () => {
        const userDoc = {
            dismissedAnnouncementIds: [],
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockResolvedValue(userDoc),
        });

        const req = {
            user: { id: String(userId), role: "Owner", tenantId: String(tenantId) },
            plan: { key: "platinum" },
        };
        const res = mockRes();

        await dismissAllAnnouncements(req, res);

        expect(res.body.ok).toBe(true);
        expect(res.body.dismissedCount).toBe(1);
        expect(userDoc.dismissedAnnouncementIds.map(String)).toEqual([String(featureId)]);
    });

    it("POST dismiss returns 404 when announcement is outside audience", async () => {
        vi.spyOn(User, "findById").mockReturnValue({
            select: vi.fn().mockResolvedValue({
                dismissedAnnouncementIds: [],
                save: vi.fn(),
            }),
        });

        const req = {
            params: { id: String(roleOnlyId) },
            user: { id: String(userId), role: "Owner", tenantId: String(tenantId) },
            plan: { key: "platinum" },
        };
        const res = mockRes();

        await dismissAnnouncement(req, res);

        expect(res.statusCode).toBe(404);
    });
});
