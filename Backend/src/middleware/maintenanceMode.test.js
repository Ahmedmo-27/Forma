import mongoose from "mongoose";
import PlatformSetting from "../models/PlatformSetting";
import { maintenanceGuard, clearMaintenanceCache, isAllowedPath } from "./maintenanceMode";

function run(path, method = "GET") {
    const req = { path, method };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();
    return maintenanceGuard(req, res, next).then(() => ({ res, next }));
}

describe("maintenance guard", () => {
    let readyState;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearMaintenanceCache();
        readyState = vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    });

    afterEach(() => {
        readyState.mockRestore();
    });

    it("allows health, platform, and webhook paths", () => {
        expect(isAllowedPath("/")).toBe(true);
        expect(isAllowedPath("/health")).toBe(true);
        expect(isAllowedPath("/api/platform/system/maintenance")).toBe(true);
        expect(isAllowedPath("/api/webhooks/meta")).toBe(true);
        expect(isAllowedPath("/api/members")).toBe(false);
        expect(isAllowedPath("/api/platformx")).toBe(false);
    });

    it("returns 503 MAINTENANCE_MODE for tenant routes when enabled", async () => {
        vi.spyOn(PlatformSetting, "findOne").mockReturnValue({
            lean: () => Promise.resolve({ value: { enabled: true, message: "Back at 6pm" } }),
        });

        const { res, next } = await run("/api/members");

        const err = next.mock.calls[0][0];
        expect(err.status).toBe(503);
        expect(err.code).toBe("MAINTENANCE_MODE");
        expect(err.message).toBe("Back at 6pm");
        expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "300");
    });

    it("lets platform routes through while enabled", async () => {
        const findOne = vi.spyOn(PlatformSetting, "findOne");
        const { next } = await run("/api/platform/tenants");
        expect(next).toHaveBeenCalledWith();
        expect(findOne).not.toHaveBeenCalled();
    });

    it("passes requests through when disabled", async () => {
        vi.spyOn(PlatformSetting, "findOne").mockReturnValue({
            lean: () => Promise.resolve({ value: { enabled: false } }),
        });
        const { next } = await run("/api/members", "POST");
        expect(next).toHaveBeenCalledWith();
    });

    it("fails open when the setting cannot be read", async () => {
        vi.spyOn(PlatformSetting, "findOne").mockReturnValue({
            lean: () => Promise.reject(new Error("db down")),
        });
        const { next } = await run("/api/members");
        expect(next).toHaveBeenCalledWith();
    });

    it("does not query Mongo while disconnected", async () => {
        readyState.mockReturnValue(0);
        const findOne = vi.spyOn(PlatformSetting, "findOne");
        const { next } = await run("/api/members");
        expect(next).toHaveBeenCalledWith();
        expect(findOne).not.toHaveBeenCalled();
    });
});
