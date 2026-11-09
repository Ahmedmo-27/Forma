const { protect } = require("./authMiddleware");
const authorize = require("./roleMiddleware");

describe("uploads auth protection", () => {
    it("returns 401 when no bearer token is provided", async () => {
        const req = {
            headers: {},
            originalUrl: "/uploads/guessed.jpg",
            method: "GET",
            ip: "127.0.0.1",
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };
        const next = vi.fn();

        await protect(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Not authorized, no token" });
    });

    it("blocks roles that are not allowed to access uploads", () => {
        const req = { user: { role: "Unknown" } };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };
        const next = vi.fn();

        const allowedRoles = authorize(
            "Receptionist",
            "Owner",
            "Sales",
            "Sales Manager",
            "Coach",
            "Coach Manager",
            "Accountant"
        );

        allowedRoles(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("allows authorized staff roles including General Manager to access uploads", () => {
        const req = { user: { role: "General Manager" } };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };
        const next = vi.fn();

        const allowedRoles = authorize(
            "Receptionist",
            "Owner",
            "General Manager",
            "Sales",
            "Sales Manager",
            "Coach",
            "Coach Manager",
            "Accountant"
        );

        allowedRoles(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});
