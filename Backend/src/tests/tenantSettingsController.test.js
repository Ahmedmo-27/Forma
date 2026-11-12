import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import Member from "../models/Member";
import User from "../models/User";
import * as tenantContext from "../context/tenantContext";
import * as audit from "../utils/audit";
import { updateMyTenantSettings } from "../controllers/tenantController";

describe("updateMyTenantSettings controller", () => {
    let mockTenant;
    const tenantId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(tenantContext, "runAsPlatform").mockImplementation((fn) => fn());
        vi.spyOn(audit, "writeAudit").mockResolvedValue(true);
        vi.spyOn(Member, "countDocuments").mockResolvedValue(10);
        vi.spyOn(User, "countDocuments").mockResolvedValue(2);

        mockTenant = {
            _id: new mongoose.Types.ObjectId(tenantId),
            name: "Acme Gym",
            planId: { _id: new mongoose.Types.ObjectId(), key: "gold", name: "Gold Plan" },
            settings: {
                branding: {
                    displayName: "Old Name",
                    palette: {
                        primary: "#44298C",
                        secondary: "#5B38BA",
                        accent: "#6D47CC",
                        background: "#F4F5F7",
                        text: "#111827",
                    },
                },
                locale: {
                    toObject: () => ({ timezone: "Africa/Cairo", language: "en", currency: "EGP" }),
                    timezone: "Africa/Cairo",
                    language: "en",
                    currency: "EGP",
                },
                enabledActivities: ["gym"],
                whatsapp: {
                    phoneNumberId: null,
                    businessAccountId: null,
                    accessToken: null,
                },
                featureConfig: {},
            },
            markModified: vi.fn(),
            save: vi.fn().mockResolvedValue(true),
        };

        vi.spyOn(Tenant, "findById").mockReturnValue({
            populate: vi.fn().mockResolvedValue(mockTenant),
        });
    });

    it("correctly updates branding and palette from top-level body", async () => {
        const req = {
            user: { tenantId, id: userId, role: "Owner" },
            body: {
                branding: {
                    displayName: "New Gym Name",
                    palette: {
                        primary: "#FF0000",
                        secondary: "#00FF00",
                    },
                },
            },
        };

        const jsonMock = vi.fn();
        const res = {
            json: jsonMock,
            status: vi.fn().mockReturnThis(),
        };

        await updateMyTenantSettings(req, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(mockTenant.settings.branding.displayName).toBe("New Gym Name");
        expect(mockTenant.settings.branding.palette.primary).toBe("#FF0000");
        expect(mockTenant.settings.branding.palette.secondary).toBe("#00FF00");
        expect(mockTenant.markModified).toHaveBeenCalledWith("settings.branding");
        expect(mockTenant.markModified).toHaveBeenCalledWith("settings");
        expect(mockTenant.save).toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalled();
    });

    it("correctly updates branding and palette from nested settings body", async () => {
        const req = {
            user: { tenantId, id: userId, role: "Owner" },
            body: {
                settings: {
                    branding: {
                        displayName: "Nested Gym Name",
                        palette: {
                            primary: "#123456",
                            text: "#999999",
                        },
                    },
                },
            },
        };

        const jsonMock = vi.fn();
        const res = {
            json: jsonMock,
            status: vi.fn().mockReturnThis(),
        };

        await updateMyTenantSettings(req, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(mockTenant.settings.branding.displayName).toBe("Nested Gym Name");
        expect(mockTenant.settings.branding.palette.primary).toBe("#123456");
        expect(mockTenant.settings.branding.palette.text).toBe("#999999");
        expect(mockTenant.save).toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalled();
    });

    it("correctly updates locale currency and countryCode", async () => {
        const req = {
            user: { tenantId, id: userId, role: "Owner" },
            body: {
                locale: {
                    currency: "USD",
                    countryCode: "1",
                    timezone: "America/New_York",
                },
            },
        };

        const jsonMock = vi.fn();
        const res = {
            json: jsonMock,
            status: vi.fn().mockReturnThis(),
        };

        await updateMyTenantSettings(req, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(mockTenant.settings.locale.currency).toBe("USD");
        expect(mockTenant.settings.locale.countryCode).toBe("1");
        expect(mockTenant.settings.locale.timezone).toBe("America/New_York");
        expect(mockTenant.save).toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalled();
    });
});
