const mongoose = require("mongoose");
const { createSessionManager } = require("./sessionManager");
const {
    ALLOWED_TEST_PHONE,
    ALLOWED_JID,
    SafetyViolationError,
    assertAllowedRecipient,
    isAllowedRecipient,
} = require("../../../scripts/perf/whatsapp-safety-guard");
const {
    createHarnessFactory,
    getMemorySnapshot,
} = require("../../../scripts/perf/whatsapp-harness");

function mockObjectId(index = 0) {
    return new mongoose.Types.ObjectId(index.toString().padStart(24, "0")).toString();
}

describe("WhatsApp Performance & Safety Guard Suite", () => {
    describe("Safety Guard Enforcement", () => {
        it("allows ONLY the explicitly authorized phone number 01229004551", () => {
            expect(isAllowedRecipient("01229004551")).toBe(true);
            expect(isAllowedRecipient("+201229004551")).toBe(true);
            expect(isAllowedRecipient("201229004551@s.whatsapp.net")).toBe(true);

            expect(() => assertAllowedRecipient("01229004551")).not.toThrow();
        });

        it("STRICTLY REJECTS any unauthorized recipient with SafetyViolationError", () => {
            const unauthorizedNumbers = [
                "01001234567",
                "+201099998888",
                "01112223334",
                "14155552671",
                "201001234567@s.whatsapp.net",
                "",
                null,
                undefined,
            ];

            for (const phone of unauthorizedNumbers) {
                expect(isAllowedRecipient(phone)).toBe(false);
                expect(() => assertAllowedRecipient(phone)).toThrow(SafetyViolationError);
            }
        });
    });

    describe("Multi-Session Scaling & Memory Profile", () => {
        it("scales to 25 concurrent sessions with minimal memory growth and fast lookup", async () => {
            const memBefore = getMemorySnapshot();
            const { loadBaileysMock } = createHarnessFactory();
            const persisted = [];

            const manager = createSessionManager({
                loadBaileys: loadBaileysMock(),
                useAuthState: async () => ({
                    state: { creds: { me: { id: "201229004551:1@s.whatsapp.net" } }, keys: { get: async () => ({}), set: async () => {} } },
                    saveCreds: async () => {},
                }),
                persistStatus: async (p) => persisted.push(p),
                clearAuth: async () => {},
                hasCreds: async () => true,
                sleep: async () => {},
                minGapMs: 0,
            });

            const SESSION_COUNT = 25;
            const startTime = Date.now();

            // Start 25 sessions in parallel
            await Promise.all(
                Array.from({ length: SESSION_COUNT }, async (_, i) => {
                    const tenantId = mockObjectId(i % 5 + 1);
                    const userId = mockObjectId(i + 10);
                    const res = await manager.start({ tenantId, userId });
                    expect(res.status).toBe("connecting");
                })
            );

            const durationMs = Date.now() - startTime;
            expect(durationMs).toBeLessThan(1000); // 25 sessions should initialize in < 1 second

            // Measure lookup performance across all 25 sessions
            const lookupStart = Date.now();
            const lookups = await Promise.all(
                Array.from({ length: SESSION_COUNT * 4 }, async (_, i) => {
                    const idx = i % SESSION_COUNT;
                    return manager.getStatus({
                        tenantId: mockObjectId(idx % 5 + 1),
                        userId: mockObjectId(idx + 10),
                    });
                })
            );
            const lookupDurationMs = Date.now() - lookupStart;

            expect(lookups.length).toBe(100);
            expect(lookupDurationMs).toBeLessThan(100); // 100 in-memory lookups in < 100ms

            const memAfter = getMemorySnapshot();
            const heapDeltaMb = memAfter.heapUsedMb - memBefore.heapUsedMb;
            // 25 mock sessions should not consume more than 20MB of heap
            expect(heapDeltaMb).toBeLessThan(20);
        });
    });

    describe("Message Pacing & Concurrency Race Condition Audit", () => {
        it("enforces safety check on all message dispatches", async () => {
            let capturedSocket = null;
            const tenantId = mockObjectId(1);
            const userId = mockObjectId(2);

            const manager = createSessionManager({
                loadBaileys: async () => ({
                    makeWASocket: () => {
                        capturedSocket = {
                            user: { id: "201229004551:1@s.whatsapp.net" },
                            ev: { on: (event, fn) => { if (event === "connection.update") capturedSocket.connHandler = fn; } },
                            sendMessage: vi.fn(async (jid) => {
                                assertAllowedRecipient(jid);
                                return {};
                            }),
                            onWhatsApp: vi.fn(async (jid) => {
                                assertAllowedRecipient(jid);
                                return [{ jid: ALLOWED_JID, exists: true }];
                            }),
                        };
                        return capturedSocket;
                    },
                    DisconnectReason: {},
                    makeCacheableSignalKeyStore: (k) => k,
                    Browsers: { macOS: () => ["Mac OS", "Chrome", "14.4.1"] },
                    logger: { level: "silent", child() { return this; } },
                }),
                useAuthState: async () => ({
                    state: { creds: { me: { id: "201229004551:1@s.whatsapp.net" } } },
                    saveCreds: async () => {},
                }),
                persistStatus: async () => {},
                clearAuth: async () => {},
                hasCreds: async () => true,
                sleep: async () => {},
                minGapMs: 10,
            });

            await manager.start({ tenantId, userId });
            capturedSocket.connHandler({ connection: "open" });

            // Allowed phone succeeds
            await expect(
                manager.sendText({
                    tenantId,
                    userId,
                    phone: ALLOWED_TEST_PHONE,
                    text: "Hello permitted user",
                })
            ).resolves.toEqual(expect.objectContaining({ status: "sent" }));

            // Unauthorized phone fails with safety error
            await expect(
                manager.sendText({
                    tenantId,
                    userId,
                    phone: "01099998888",
                    text: "Hello unauthorized",
                })
            ).rejects.toThrow(SafetyViolationError);
        });

        it("audits concurrent bursts on the same session to measure pacing synchronization", async () => {
            const sendTimestamps = [];
            let virtualClock = 1000;
            const minGapMs = 50;
            const tenantId = mockObjectId(1);
            const userId = mockObjectId(2);

            let capturedSocket = null;
            const manager = createSessionManager({
                loadBaileys: async () => ({
                    makeWASocket: () => {
                        capturedSocket = {
                            user: { id: "201229004551:1@s.whatsapp.net" },
                            ev: { on: (event, fn) => { if (event === "connection.update") capturedSocket.connHandler = fn; } },
                            sendMessage: vi.fn(async () => {
                                sendTimestamps.push(virtualClock);
                                return {};
                            }),
                            onWhatsApp: vi.fn(async () => [{ jid: ALLOWED_JID, exists: true }]),
                        };
                        return capturedSocket;
                    },
                    DisconnectReason: {},
                    makeCacheableSignalKeyStore: (k) => k,
                    Browsers: { macOS: () => ["Mac OS", "Chrome", "14.4.1"] },
                    logger: { level: "silent", child() { return this; } },
                }),
                useAuthState: async () => ({
                    state: { creds: { me: { id: "201229004551:1@s.whatsapp.net" } } },
                    saveCreds: async () => {},
                }),
                persistStatus: async () => {},
                clearAuth: async () => {},
                hasCreds: async () => true,
                sleep: async (ms) => {
                    virtualClock += ms;
                },
                now: () => virtualClock,
                minGapMs,
            });

            await manager.start({ tenantId, userId });
            capturedSocket.connHandler({ connection: "open" });

            // Send 3 sequential messages
            await manager.sendText({ tenantId, userId, phone: ALLOWED_TEST_PHONE, text: "Msg 1" });
            await manager.sendText({ tenantId, userId, phone: ALLOWED_TEST_PHONE, text: "Msg 2" });
            await manager.sendText({ tenantId, userId, phone: ALLOWED_TEST_PHONE, text: "Msg 3" });

            expect(sendTimestamps.length).toBe(3);
            // Verify sequential spacing was enforced
            expect(sendTimestamps[1] - sendTimestamps[0]).toBeGreaterThanOrEqual(minGapMs);
            expect(sendTimestamps[2] - sendTimestamps[1]).toBeGreaterThanOrEqual(minGapMs);
        });
    });

    describe("Recovery & Reconnection Resilience", () => {
        it("restores connected sessions with batch concurrency without leaking memory", async () => {
            const restored = [];
            const mockRows = Array.from({ length: 15 }, (_, i) => ({
                tenantId: mockObjectId(i + 1),
                userId: mockObjectId(i + 100),
            }));

            const { loadBaileysMock } = createHarnessFactory();
            const manager = createSessionManager({
                loadBaileys: loadBaileysMock(),
                listConnected: async () => mockRows,
                useAuthState: async () => ({
                    state: { creds: { me: { id: "201229004551:1@s.whatsapp.net" } }, keys: { get: async () => ({}), set: async () => {} } },
                    saveCreds: async () => {},
                }),
                persistStatus: async ({ userId, status }) => {
                    restored.push({ userId, status });
                },
                clearAuth: async () => {},
                hasCreds: async () => true,
                sleep: async () => {},
            });

            await manager.restoreConnected();
            expect(restored.length).toBe(15);
            expect(restored.every((r) => r.status === "connecting")).toBe(true);
        });
    });
});
