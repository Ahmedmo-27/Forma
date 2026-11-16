/**
 * Phase 3 — NoSQL injection sanitizer + login operator rejection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import sanitizeRequest from "../../middleware/sanitize";
import { loginUser } from "../../controllers/userController";
import User from "../../models/User";

describe("Security Phase 3: NoSQL sanitize middleware", () => {
    it("strips $gt / $ne operators from body keys", () => {
        const req = {
            body: { email: { $gt: "" }, password: { $ne: null } },
            params: {},
            query: {},
        };
        const next = vi.fn();
        sanitizeRequest(req, {}, next);
        expect(next).toHaveBeenCalled();
        // express-mongo-sanitize replaces $ with replaceWith ('_')
        expect(JSON.stringify(req.body)).not.toMatch(/"\$gt"/);
        expect(JSON.stringify(req.body)).not.toMatch(/"\$ne"/);
    });

    it("strips operators from query objects", () => {
        const req = {
            body: {},
            params: {},
            query: { search: { $regex: ".*" } },
        };
        const next = vi.fn();
        sanitizeRequest(req, {}, next);
        expect(JSON.stringify(req.query)).not.toMatch(/"\$regex"/);
    });
});

describe("Security Phase 3: login rejects operator-shaped credentials", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "nosql_login_secret";
    });

    it("does not authenticate when email is an operator object", async () => {
        const findSpy = vi.spyOn(User, "find").mockResolvedValue([]);
        const req = {
            body: { email: { $gt: "" }, password: "anything" },
            requestId: "nosql-1",
            ip: "127.0.0.1",
            headers: {},
            get: () => null,
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };

        await loginUser(req, res);

        // Either validation/401 or find never used with raw $gt — never 200 with token
        if (res.json.mock.calls.length) {
            const payload = res.json.mock.calls[0][0];
            expect(payload.token).toBeUndefined();
        }
        expect(res.status.mock.calls.some((c) => c[0] === 200)).toBe(false);
        findSpy.mockRestore();
    });
});
