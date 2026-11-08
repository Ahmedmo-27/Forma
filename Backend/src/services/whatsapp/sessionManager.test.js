const { createSessionManager } = require("./sessionManager");

function harness() {
    const handlers = {};
    const sock = {
        user: { id: "201001234567:17@s.whatsapp.net" },
        ev: {
            on: (event, fn) => {
                handlers[event] = fn;
            },
        },
        logout: vi.fn(async () => {}),
        end: vi.fn(),
        sendMessage: vi.fn(async () => ({})),
        onWhatsApp: vi.fn(async (jid) => [{ jid, exists: true }]),
    };
    let stored = false;
    const clearAuth = vi.fn(async () => {
        stored = false;
    });
    const persistStatus = vi.fn(async () => {});
    const macOS = vi.fn((name) => ["Mac OS", name, "14.4.1"]);
    let authLoads = 0;
    const manager = createSessionManager({
        loadBaileys: async () => ({
            makeWASocket: () => sock,
            DisconnectReason: {
                loggedOut: 401,
                badSession: 500,
                forbidden: 403,
                connectionReplaced: 440,
                restartRequired: 515,
            },
            fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
            makeCacheableSignalKeyStore: (keys) => keys,
            Browsers: { macOS },
            logger: {
                level: "silent",
                child() { return this; },
                trace() {},
                debug() {},
                info() {},
                warn() {},
                error() {},
            },
        }),
        useAuthState: async () => {
            authLoads += 1;
            return {
                state: { creds: {}, keys: { get: async () => ({}), set: async () => {} } },
                saveCreds: async () => {
                    stored = true;
                },
            };
        },
        persistStatus,
        clearAuth,
        hasCreds: async () => stored,
        sleep: async () => {},
        minGapMs: 0,
    });
    return {
        manager,
        sock,
        handlers,
        clearAuth,
        persistStatus,
        macOS,
        authLoads: () => authLoads,
        markStored: () => { stored = true; },
    };
}

async function connect(handlers) {
    await handlers["connection.update"]({ connection: "open" });
}

describe("WhatsApp session manager", () => {
    it("rejects a send when this user has not linked WhatsApp", async () => {
        const { manager } = harness();
        await expect(manager.sendText({
            tenantId: "t1",
            userId: "u1",
            phone: "01001234567",
            text: "Hello",
        })).rejects.toMatchObject({ code: "WHATSAPP_NOT_CONNECTED" });
    });

    it("sends text from the connected socket", async () => {
        const { manager, sock, handlers, persistStatus } = harness();
        await manager.start({ tenantId: "t1", userId: "u1" });
        await connect(handlers);

        await manager.sendText({
            tenantId: "t1",
            userId: "u1",
            phone: "01001234567",
            text: "Hello",
        });

        expect(persistStatus).toHaveBeenCalledWith(expect.objectContaining({
            status: "connected",
            phone: "201001234567",
        }));
        expect(sock.onWhatsApp).toHaveBeenCalledWith("201001234567@s.whatsapp.net");
        expect(sock.sendMessage).toHaveBeenCalledWith(
            "201001234567@s.whatsapp.net",
            { text: "Hello" }
        );
    });

    it("rejects a number that is not registered on WhatsApp", async () => {
        const { manager, sock, handlers } = harness();
        sock.onWhatsApp.mockResolvedValue([{ jid: "201001234567@s.whatsapp.net", exists: false }]);
        await manager.start({ tenantId: "t1", userId: "u1" });
        await connect(handlers);

        await expect(manager.sendText({
            tenantId: "t1",
            userId: "u1",
            phone: "01001234567",
            text: "Hello",
        })).rejects.toMatchObject({ code: "WHATSAPP_NOT_ON_WHATSAPP" });
        expect(sock.sendMessage).not.toHaveBeenCalled();
    });

    it("identifies the linked device as Chrome and reuses that login after a scan", async () => {
        const { manager, handlers, macOS, authLoads } = harness();
        await manager.start({ tenantId: "t1", userId: "u1" });
        expect(macOS).toHaveBeenCalledWith("Chrome");

        await handlers["connection.update"]({
            connection: "close",
            lastDisconnect: { error: { output: { statusCode: 515 }, message: "restart required" } },
        });
        await vi.waitFor(() => expect(macOS).toHaveBeenCalledTimes(2));
        expect(authLoads()).toBe(1);
    });

    it("logout unlinks the socket and clears stored auth", async () => {
        const { manager, sock, handlers, clearAuth } = harness();
        await manager.start({ tenantId: "t1", userId: "u1" });
        await connect(handlers);

        const status = await manager.logout({ tenantId: "t1", userId: "u1" });

        expect(sock.logout).toHaveBeenCalled();
        expect(clearAuth).toHaveBeenCalledWith({ tenantId: "t1", userId: "u1" });
        expect(status).toMatchObject({ status: "disconnected", phone: null, qr: null });
        await expect(manager.sendText({
            tenantId: "t1",
            userId: "u1",
            phone: "01001234567",
            text: "Hello",
        })).rejects.toMatchObject({ code: "WHATSAPP_NOT_CONNECTED" });
    });
});
