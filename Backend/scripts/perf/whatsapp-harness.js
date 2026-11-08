"use strict";

const EventEmitter = require("events");
const { ALLOWED_TEST_PHONE, ALLOWED_JID, assertAllowedRecipient } = require("./whatsapp-safety-guard");
const { toWhatsAppJid } = require("../../src/services/whatsapp/phone");

function calculatePercentiles(values) {
    if (!values || values.length === 0) {
        return { count: 0, min: 0, median: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const pick = (pct) => {
        const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((pct / 100) * sorted.length)));
        return sorted[index];
    };
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return {
        count: sorted.length,
        min: sorted[0],
        median: pick(50),
        p90: pick(90),
        p95: pick(95),
        p99: pick(99),
        max: sorted[sorted.length - 1],
        avg: Math.round((sum / sorted.length) * 100) / 100,
    };
}

function getMemorySnapshot() {
    const mem = process.memoryUsage();
    return {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
        arrayBuffersMb: Math.round(((mem.arrayBuffers || 0) / 1024 / 1024) * 100) / 100,
    };
}

class MockBaileysSocket {
    constructor(options = {}) {
        this.options = options;
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(100);
        this.latencyMs = options.latencyMs || 0;
        this.enforcePhoneSafety = options.enforcePhoneSafety !== false;
        this.mode = options.mode || "simulation"; // "simulation" | "live-guarded"
        this.user = { id: `${options.phone || "201000000000"}:1@s.whatsapp.net` };
        this.isClosed = false;
        this.dispatchedMessages = [];
        this.ev = {
            on: (event, handler) => {
                this.emitter.on(event, handler);
            },
            off: (event, handler) => {
                this.emitter.off(event, handler);
            },
            emit: (event, payload) => {
                this.emitter.emit(event, payload);
            },
        };
    }

    async sleep(ms) {
        if (!ms) return;
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async onWhatsApp(jid) {
        if (this.latencyMs > 0) await this.sleep(this.latencyMs);

        // Strict safety check: if safety enforcement is on, only ALLOWED_JID is permitted
        if (this.enforcePhoneSafety) {
            assertAllowedRecipient(jid);
            return [{ jid: ALLOWED_JID, exists: true }];
        }

        // In simulation mode without safety enforcement (internal virtual IDs)
        return [{ jid, exists: true }];
    }

    async sendMessage(jid, content) {
        if (this.isClosed) {
            throw new Error("Socket is already closed");
        }

        // Strict safety assertion: verify recipient before dispatch
        if (this.enforcePhoneSafety) {
            assertAllowedRecipient(jid);
        }

        if (this.latencyMs > 0) await this.sleep(this.latencyMs);

        const record = {
            jid,
            content,
            timestamp: Date.now(),
            sizeBytes: content.image
                ? Buffer.byteLength(content.image)
                : Buffer.byteLength(content.text || "", "utf8"),
        };
        this.dispatchedMessages.push(record);
        return { key: { id: `MOCK_MSG_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }, status: 1 };
    }

    async logout() {
        this.isClosed = true;
        this.emitter.removeAllListeners();
    }

    end(err) {
        this.isClosed = true;
        this.emitter.removeAllListeners();
    }

    simulateConnectionOpen() {
        this.ev.emit("connection.update", {
            connection: "open",
        });
    }

    simulateQr(qrCode = "MOCK_QR_DATA_BASE64") {
        this.ev.emit("connection.update", {
            connection: "connecting",
            qr: qrCode,
        });
    }

    simulateDisconnect(statusCode, message = "Simulated disconnect") {
        const err = new Error(message);
        err.output = { statusCode };
        this.ev.emit("connection.update", {
            connection: "close",
            lastDisconnect: { error: err },
        });
    }
}

function createHarnessFactory(customConfig = {}) {
    const activeSockets = new Map();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const defaultLogger = {
        level: "silent",
        child() { return this; },
        trace() {},
        debug() {},
        info() {},
        warn() {},
        error() {},
    };

    const DisconnectReason = {
        loggedOut: 401,
        forbidden: 403,
        connectionReplaced: 440,
        badSession: 500,
        restartRequired: 515,
        timedOut: 408,
    };

    function loadBaileysMock(options = {}) {
        return async () => ({
            makeWASocket: (conf) => {
                const key = `${conf.auth?.creds?.me?.id || Math.random().toString(36).slice(2, 8)}`;
                const sock = new MockBaileysSocket({
                    ...customConfig,
                    ...options,
                });
                activeSockets.set(key, sock);
                return sock;
            },
            DisconnectReason,
            fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
            makeCacheableSignalKeyStore: (keys) => keys,
            Browsers: {
                macOS: (name) => ["Mac OS", name, "14.4.1"],
            },
            logger: defaultLogger,
        });
    }

    return {
        loadBaileysMock,
        activeSockets,
        DisconnectReason,
        sleep,
    };
}

module.exports = {
    calculatePercentiles,
    getMemorySnapshot,
    MockBaileysSocket,
    createHarnessFactory,
    ALLOWED_TEST_PHONE,
    ALLOWED_JID,
};
