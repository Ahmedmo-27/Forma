import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createSessionManager } = require("../../services/whatsapp/sessionManager");
const { extractInboundMessage } = require("../../services/whatsapp/inboundMessage");

const msg = (overrides = {}) => ({
    key: { remoteJid: "201001234567@s.whatsapp.net", fromMe: false, id: "ABC" },
    message: { conversation: "Hello" },
    messageTimestamp: 1700000000,
    pushName: "Sara",
    ...overrides,
});

describe("extractInboundMessage", () => {
    it("reads a plain text message", () => {
        expect(extractInboundMessage(msg())).toMatchObject({
            contactPhone: "201001234567",
            contactExternalId: "201001234567",
            fromMe: false,
            text: "Hello",
            messageId: "ABC",
            timestamp: 1700000000 * 1000,
            pushName: "Sara",
        });
    });

    it("reads extended text, captions, and unwraps ephemeral and view-once content", () => {
        expect(extractInboundMessage(msg({ message: { extendedTextMessage: { text: "Link" } } })).text).toBe("Link");
        const image = extractInboundMessage(msg({ message: { imageMessage: { caption: "Look", mimetype: "image/jpeg" } } }));
        expect(image.text).toBe("Look");
        expect(image.attachments).toEqual([{ type: "image", mimeType: "image/jpeg" }]);
        expect(extractInboundMessage(msg({
            message: { ephemeralMessage: { message: { conversation: "Disappearing" } } },
        })).text).toBe("Disappearing");
        expect(extractInboundMessage(msg({
            message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: "image/png" } } } },
        })).attachments[0].type).toBe("image");
    });

    it("ignores groups, status, channels, reactions, protocol updates, and empty content", () => {
        for (const remoteJid of ["1203@g.us", "status@broadcast", "123@newsletter"]) {
            expect(extractInboundMessage(msg({ key: { remoteJid, id: "x" } }))).toBeNull();
        }
        expect(extractInboundMessage(msg({ message: { reactionMessage: { text: "x" } } }))).toBeNull();
        expect(extractInboundMessage(msg({ message: { protocolMessage: { type: 0 } } }))).toBeNull();
        expect(extractInboundMessage(msg({ message: {} }))).toBeNull();
        expect(extractInboundMessage(msg({ message: null }))).toBeNull();
        expect(extractInboundMessage(null)).toBeNull();
    });

    it("keeps the raw JID for a LID contact, and prefers the phone when Baileys exposes it", () => {
        const lid = extractInboundMessage(msg({ key: { remoteJid: "98765@lid", id: "L1" } }));
        expect(lid.contactPhone).toBeNull();
        expect(lid.contactExternalId).toBe("98765@lid");

        const withPhone = extractInboundMessage(msg({
            key: { remoteJid: "98765@lid", remoteJidAlt: "201001234567@s.whatsapp.net", id: "L2" },
        }));
        expect(withPhone.contactExternalId).toBe("201001234567");
    });

    it("marks our own sends as fromMe", () => {
        const own = extractInboundMessage(msg({ key: { remoteJid: "201001234567@s.whatsapp.net", fromMe: true, id: "O1" } }));
        expect(own.fromMe).toBe(true);
        expect(own.pushName).toBeNull();
    });
});

function harness(extra = {}) {
    const handlers = {};
    const sock = {
        user: { id: "201001234567:17@s.whatsapp.net" },
        ev: { on: (event, fn) => { handlers[event] = fn; } },
        logout: vi.fn(async () => {}),
        end: vi.fn(),
        sendMessage: vi.fn(async () => ({ key: { id: "WAID1" } })),
        onWhatsApp: vi.fn(async (jid) => [{ jid, exists: true }]),
    };
    let stored = false;
    const manager = createSessionManager({
        loadBaileys: async () => ({
            makeWASocket: () => sock,
            DisconnectReason: { loggedOut: 401, badSession: 500, forbidden: 403, connectionReplaced: 440, restartRequired: 515 },
            fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
            makeCacheableSignalKeyStore: (keys) => keys,
            Browsers: { macOS: (name) => ["Mac OS", name, "14.4.1"] },
            logger: { level: "silent", child() { return this; }, trace() {}, debug() {}, info() {}, warn() {}, error() {} },
        }),
        useAuthState: async () => ({
            state: { creds: {}, keys: { get: async () => ({}), set: async () => {} } },
            saveCreds: async () => { stored = true; },
        }),
        persistStatus: async () => {},
        clearAuth: async () => { stored = false; },
        hasCreds: async () => stored,
        sleep: async () => {},
        minGapMs: 0,
        replyGapMs: 0,
        ...extra,
    });
    return { manager, sock, handlers };
}

describe("session manager inbox hooks", () => {
    it("forwards live (notify) messages with the owning gym and user", async () => {
        const onInbound = vi.fn(async () => {});
        const { manager, handlers } = harness({ onInbound });
        await manager.start({ tenantId: "t1", userId: "u1" });
        await handlers["connection.update"]({ connection: "open" });

        await handlers["messages.upsert"]({ type: "notify", messages: [msg()] });

        expect(onInbound).toHaveBeenCalledTimes(1);
        expect(onInbound).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: "t1",
            userId: "u1",
            phone: "201001234567",
            message: expect.objectContaining({ text: "Hello", contactExternalId: "201001234567" }),
        }));
    });

    it("ignores history and our own sends that arrive as append", async () => {
        const onInbound = vi.fn(async () => {});
        const { manager, handlers } = harness({ onInbound });
        await manager.start({ tenantId: "t1", userId: "u1" });
        await handlers["connection.update"]({ connection: "open" });

        await handlers["messages.upsert"]({ type: "append", messages: [msg()] });
        await handlers["messages.upsert"]({ type: "notify", messages: [msg({ message: { reactionMessage: {} } })] });

        expect(onInbound).not.toHaveBeenCalled();
    });

    it("keeps working when the inbox hook throws", async () => {
        const onInbound = vi.fn(async () => { throw new Error("db down"); });
        const { manager, handlers } = harness({ onInbound });
        await manager.start({ tenantId: "t1", userId: "u1" });
        await handlers["connection.update"]({ connection: "open" });

        await expect(handlers["messages.upsert"]({
            type: "notify",
            messages: [msg(), msg({ key: { remoteJid: "201001234568@s.whatsapp.net", id: "B" } })],
        })).resolves.toBeUndefined();
        expect(onInbound).toHaveBeenCalledTimes(2);
    });

    it("reports connect and disconnect so the channel row follows the session", async () => {
        const onSessionChange = vi.fn(async () => {});
        const { manager, handlers } = harness({ onSessionChange });
        await manager.start({ tenantId: "t1", userId: "u1" });
        await handlers["connection.update"]({ connection: "open" });
        await vi.waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: "t1", userId: "u1", status: "connected", phone: "201001234567",
        })));

        await manager.logout({ tenantId: "t1", userId: "u1" });
        await vi.waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(expect.objectContaining({ status: "disconnected" })));
    });

    it("replies to a stored contact id without guessing a country code or looking the number up", async () => {
        const { manager, sock, handlers } = harness();
        await manager.start({ tenantId: "t1", userId: "u1" });
        await handlers["connection.update"]({ connection: "open" });

        const phoneReply = await manager.sendReply({ tenantId: "t1", userId: "u1", to: "201001234567", text: "Welcome" });
        expect(sock.sendMessage).toHaveBeenCalledWith("201001234567@s.whatsapp.net", { text: "Welcome" });
        expect(phoneReply).toEqual({ status: "sent", messageId: "WAID1" });

        await manager.sendReply({ tenantId: "t1", userId: "u1", to: "98765@lid", text: "Hi" });
        expect(sock.sendMessage).toHaveBeenLastCalledWith("98765@lid", { text: "Hi" });
        expect(sock.onWhatsApp).not.toHaveBeenCalled();
    });

    it("rejects a reply when WhatsApp is not linked", async () => {
        const { manager } = harness();
        await expect(manager.sendReply({ tenantId: "t1", userId: "u1", to: "201001234567", text: "x" }))
            .rejects.toMatchObject({ code: "WHATSAPP_NOT_CONNECTED" });
    });
});
