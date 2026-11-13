import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mailer from "../services/mailer";

const ENV_KEYS = ["BREVO_API_KEY", "MAIL_FROM", "MAIL_FROM_SECURITY"];
const RESET_URL = "https://app.forma-official.com/auth/setup-password?token=abc";
const INVITE_URL = "https://app.forma-official.com/auth/setup-password?token=invite";

function configureBrevo() {
    process.env.BREVO_API_KEY = "test-key";
    process.env.MAIL_FROM = "Forma <noreply@forma-official.com>";
    process.env.MAIL_FROM_SECURITY = "Forma <security@forma-official.com>";
}

function mockFetch(response) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () => "",
        ...response,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function requestBody(fetchMock) {
    return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("brevo mailer", () => {
    let saved;

    beforeEach(() => {
        saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
        for (const key of ENV_KEYS) delete process.env[key];
        vi.restoreAllMocks();
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
        vi.unstubAllGlobals();
    });

    it("skips when the API key is unset", async () => {
        process.env.MAIL_FROM = "Forma <noreply@forma-official.com>";
        process.env.MAIL_FROM_SECURITY = "Forma <security@forma-official.com>";
        const fetchMock = mockFetch();

        const result = await mailer.sendPasswordReset({
            to: "owner@gym.com",
            name: "Ada",
            setupUrl: RESET_URL,
        });

        expect(result).toEqual({ skipped: true, reason: "brevo_unconfigured" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts the security sender, recipient, subject, and reset URL", async () => {
        configureBrevo();
        const fetchMock = mockFetch();

        const result = await mailer.sendPasswordReset({
            to: "owner@gym.com",
            name: "Ada",
            setupUrl: RESET_URL,
        });

        expect(result).toEqual({ skipped: false });
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.brevo.com/v3/smtp/email");
        expect(init.method).toBe("POST");
        expect(init.headers["api-key"]).toBe("test-key");
        const body = requestBody(fetchMock);
        expect(body.sender).toEqual({ name: "Forma", email: "security@forma-official.com" });
        expect(body.to).toEqual([{ email: "owner@gym.com" }]);
        expect(body.subject).toBe("Reset your Forma password");
        expect(body.htmlContent).toContain(RESET_URL);
        expect(body.textContent).toContain(RESET_URL);
        expect(body.htmlContent).toContain("Set a new password");
        expect(body.attachment).toEqual([
            expect.objectContaining({ name: "forma-logo.png" }),
        ]);
        expect(body.attachment[0].content.length).toBeGreaterThan(100);
    });

    it("falls back to MAIL_FROM when the security sender is unset", async () => {
        configureBrevo();
        delete process.env.MAIL_FROM_SECURITY;
        const fetchMock = mockFetch();

        await mailer.sendPasswordReset({
            to: "owner@gym.com",
            name: "Ada",
            setupUrl: RESET_URL,
        });

        expect(requestBody(fetchMock).sender.email).toBe("noreply@forma-official.com");
    });

    it("escapes HTML in the recipient name", async () => {
        configureBrevo();
        const fetchMock = mockFetch();

        await mailer.sendPasswordReset({
            to: "owner@gym.com",
            name: '<script>alert("x")</script>',
            setupUrl: RESET_URL,
        });

        const html = requestBody(fetchMock).htmlContent;
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    });

    it("sends invites from noreply and includes the setup link", async () => {
        configureBrevo();
        const fetchMock = mockFetch();

        await mailer.sendInvite({
            to: "owner@gym.com",
            name: "Ada",
            gymName: "North Gym",
            setupUrl: INVITE_URL,
        });

        const body = requestBody(fetchMock);
        expect(body.sender).toEqual({ name: "Forma", email: "noreply@forma-official.com" });
        expect(body.subject).toBe("Set your password for North Gym");
        expect(body.htmlContent).toContain(INVITE_URL);
        expect(body.htmlContent).toContain("North Gym");
        expect(body.textContent).toContain(INVITE_URL);
    });

    it("omits response bodies that contain a URL from the thrown error", async () => {
        configureBrevo();
        mockFetch({
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ message: `see ${RESET_URL}` }),
        });

        await expect(mailer.sendPasswordReset({
            to: "owner@gym.com",
            name: "Ada",
            setupUrl: RESET_URL,
        })).rejects.toThrow(/^Brevo send failed \(400\)$/);
    });
});
