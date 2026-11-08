const { runAsPlatform, runWithTenant } = require("../../context/tenantContext");
const WhatsAppSession = require("../../models/WhatsAppSession");
const logger = require("../../utils/logger");
const { toWhatsAppJid, phoneFromJid } = require("./phone");
const {
    useMongoAuthState,
    hasStoredCreds,
    clearStoredAuth,
} = require("./authState");

const NOT_CONNECTED = "WHATSAPP_NOT_CONNECTED";
const NOT_ON_WHATSAPP = "WHATSAPP_NOT_ON_WHATSAPP";
const RESTORE_CONCURRENCY = 3;

class WhatsAppSessionError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "WhatsAppSessionError";
        this.code = code;
    }
}

function notConnectedError() {
    return new WhatsAppSessionError(
        NOT_CONNECTED,
        "Connect WhatsApp before sending. Open Connect WhatsApp from your profile menu."
    );
}

function sessionKey(tenantId, userId) {
    return `${String(tenantId)}:${String(userId)}`;
}

function publicState(entry, fallbackPhone) {
    return {
        status: entry?.status || "disconnected",
        phone: entry?.phone || fallbackPhone || null,
        qr: entry?.status === "qr" ? entry.qr || null : null,
    };
}

async function defaultLoadBaileys() {
    const [baileys, pinoMod] = await Promise.all([
        import("@whiskeysockets/baileys"),
        import("pino"),
    ]);
    const createLogger = pinoMod.default || pinoMod;
    return {
        makeWASocket: baileys.default,
        DisconnectReason: baileys.DisconnectReason,
        fetchLatestBaileysVersion: baileys.fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore: baileys.makeCacheableSignalKeyStore,
        Browsers: baileys.Browsers,
        logger: createLogger({ level: "error" }),
    };
}

function createSessionManager(deps = {}) {
    const live = new Map();
    const loadBaileys = deps.loadBaileys || defaultLoadBaileys;
    const useAuthState = deps.useAuthState || useMongoAuthState;
    const hasCreds = deps.hasCreds || hasStoredCreds;
    const clearAuth = deps.clearAuth || clearStoredAuth;
    const persistStatus = deps.persistStatus || defaultPersistStatus;
    const listConnected = deps.listConnected || defaultListConnected;
    const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = deps.now || Date.now;
    // Floor between messages from the same linked number. Bulk send waits at
    // least this long on the client; the server enforces it if a caller does not.
    const minGapMs = deps.minGapMs ?? 20000;
    const connectTimeoutMs = deps.connectTimeoutMs ?? 35000;
    const sendTimeoutMs = deps.sendTimeoutMs ?? 60000;

    function settleWaiters(entry) {
        const waiters = entry.waiters.splice(0);
        for (const waiter of waiters) {
            if (entry.status === "connected") waiter.resolve();
            else waiter.reject(notConnectedError());
        }
    }

    async function openSocket(entry, attempt) {
        if (entry.reconnectTimer) {
            clearTimeout(entry.reconnectTimer);
            entry.reconnectTimer = null;
        }

        const generation = (entry.generation || 0) + 1;
        entry.generation = generation;
        entry.status = "connecting";
        entry.qr = null;
        entry.userStopped = false;

        const previous = entry.sock;
        entry.sock = null;
        if (previous?.end) {
            try { previous.end(undefined); } catch { /* stale socket */ }
        }

        await persistStatus({
            tenantId: entry.tenantId,
            userId: entry.userId,
            status: "connecting",
        });

        if (!entry.auth) {
            const hadCreds = await hasCreds({ tenantId: entry.tenantId, userId: entry.userId });
            entry.auth = await useAuthState({
                tenantId: entry.tenantId,
                userId: entry.userId,
            });
            // A scan that never finished leaves an unpaired secret behind.
            // The next code is then rejected with the same phone error.
            if (hadCreds && !entry.auth.state.creds?.me?.id) {
                await clearAuth({ tenantId: entry.tenantId, userId: entry.userId });
                entry.auth = await useAuthState({
                    tenantId: entry.tenantId,
                    userId: entry.userId,
                });
            }
            const save = entry.auth.saveCreds;
            let chain = Promise.resolve();
            entry.saveCreds = () => {
                chain = chain.then(() => save()).catch((error) => {
                    logger.error("whatsapp", "Could not store WhatsApp credentials", {
                        error: error.message,
                        userId: String(entry.userId),
                    });
                });
                return chain;
            };
        }

        const baileys = await loadBaileys();
        entry.disconnect = baileys.DisconnectReason;
        // Use the version shipped with this Baileys build. Fetching master on
        // every reconnect delays the post-scan restart long enough for the
        // phone to reject the link. "Chrome" is required: any other name is
        // sent as an unknown client and WhatsApp refuses the QR.
        const sock = baileys.makeWASocket({
            auth: {
                creds: entry.auth.state.creds,
                keys: baileys.makeCacheableSignalKeyStore(entry.auth.state.keys, baileys.logger),
            },
            logger: baileys.logger,
            browser: baileys.Browsers.macOS("Chrome"),
            markOnlineOnConnect: false,
            syncFullHistory: false,
        });
        if (entry.generation !== generation || entry.userStopped) {
            try { sock.end(undefined); } catch { /* superseded */ }
            return publicState(entry);
        }
        entry.sock = sock;

        sock.ev.on("creds.update", entry.saveCreds);
        sock.ev.on("connection.update", (update) => onConnectionUpdate(entry, generation, update, attempt).catch((error) => {
            logger.error("whatsapp", "WhatsApp connection update failed", {
                error: error.message,
                userId: String(entry.userId),
            });
        }));

        return publicState(entry);
    }

    async function onConnectionUpdate(entry, generation, update, attempt) {
        if (entry.generation !== generation || entry.userStopped) return;
        const key = sessionKey(entry.tenantId, entry.userId);
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const changed = entry.qr !== qr;
            entry.qr = qr;
            if (changed) {
                logger.info("whatsapp", "WhatsApp pairing code updated", {
                    userId: String(entry.userId),
                });
            }
            const becameQr = entry.status !== "qr";
            entry.status = "qr";
            if (becameQr) {
                await persistStatus({
                    tenantId: entry.tenantId,
                    userId: entry.userId,
                    status: "qr",
                });
                settleWaiters(entry);
            }
        }

        if (connection === "open") {
            entry.status = "connected";
            entry.qr = null;
            entry.phone = phoneFromJid(entry.sock?.user?.id) || entry.phone || null;
            await persistStatus({
                tenantId: entry.tenantId,
                userId: entry.userId,
                status: "connected",
                phone: entry.phone,
                lastConnectedAt: new Date(),
            });
            settleWaiters(entry);
            return;
        }

        if (connection !== "close") return;

        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = entry.disconnect || {};
        logger.warn("whatsapp", "WhatsApp connection closed", {
            userId: String(entry.userId),
            statusCode: code || null,
            message: lastDisconnect?.error?.message || null,
        });
        const wipe = code === reason.loggedOut || code === reason.badSession;
        const stop = wipe
            || code === reason.forbidden
            || code === reason.connectionReplaced;

        entry.sock = null;
        entry.qr = null;

        if (stop) {
            entry.status = "disconnected";
            if (wipe) entry.auth = null;
            live.delete(key);
            if (wipe) await clearAuth({ tenantId: entry.tenantId, userId: entry.userId });
            await persistStatus({
                tenantId: entry.tenantId,
                userId: entry.userId,
                status: "disconnected",
                phone: wipe ? null : entry.phone,
            });
            settleWaiters(entry);
            return;
        }

        entry.status = "connecting";
        // After a scan, WhatsApp closes with restartRequired and expects the
        // same credentials back immediately. Waiting here makes the phone show
        // "check your connection and try again".
        const delay = code === reason.restartRequired
            ? 0
            : Math.min(30000, 1000 * (2 ** Math.min(attempt, 5)));
        entry.reconnectTimer = setTimeout(() => {
            openSocket(entry, attempt + 1).catch((error) => {
                logger.error("whatsapp", "WhatsApp reconnect failed", {
                    error: error.message,
                    userId: String(entry.userId),
                });
            });
        }, delay);
    }

    async function start({ tenantId, userId }) {
        const key = sessionKey(tenantId, userId);
        let entry = live.get(key);
        if (
            entry?.sock
            && !entry.userStopped
            && (entry.status === "connected" || entry.status === "qr" || entry.status === "connecting")
        ) {
            return publicState(entry);
        }
        if (entry?.starting) return entry.starting;

        if (!entry) {
            entry = {
                tenantId,
                userId,
                status: "connecting",
                qr: null,
                phone: null,
                sock: null,
                waiters: [],
                generation: 0,
                userStopped: false,
            };
            live.set(key, entry);
        } else {
            entry.userStopped = false;
            if (!entry.waiters) entry.waiters = [];
        }

        entry.starting = openSocket(entry, 0).finally(() => {
            entry.starting = null;
        });
        return entry.starting;
    }

    async function getStatus({ tenantId, userId }) {
        const entry = live.get(sessionKey(tenantId, userId));
        if (entry && entry.status !== "disconnected") return publicState(entry);
        const saved = await readSaved({ tenantId, userId });
        return publicState(entry, saved?.phone || null);
    }

    async function logout({ tenantId, userId }) {
        const key = sessionKey(tenantId, userId);
        const entry = live.get(key);
        if (entry) {
            entry.userStopped = true;
            if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
            const sock = entry.sock;
            entry.sock = null;
            entry.status = "disconnected";
            entry.qr = null;
            entry.phone = null;
            live.delete(key);
            try { await sock?.logout?.(); } catch { /* already closed */ }
            try { sock?.end?.(undefined); } catch { /* already closed */ }
            settleWaiters(entry);
        }
        await clearAuth({ tenantId, userId });
        await persistStatus({ tenantId, userId, status: "disconnected", phone: null });
        return { status: "disconnected", phone: null, qr: null };
    }

    async function ensureConnected({ tenantId, userId }) {
        const key = sessionKey(tenantId, userId);
        let entry = live.get(key);
        if (entry?.status === "connected" && entry.sock) return entry;

        const saved = await hasCreds({ tenantId, userId });
        if (!saved || entry?.status === "qr") throw notConnectedError();

        if (!entry?.sock || entry.status === "disconnected" || entry.userStopped) {
            await start({ tenantId, userId });
        } else if (entry.starting) {
            await entry.starting;
        }

        entry = live.get(key);
        if (!entry || entry.status === "qr") throw notConnectedError();
        if (entry.status !== "connected") {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(notConnectedError()), connectTimeoutMs);
                entry.waiters.push({
                    resolve: () => {
                        clearTimeout(timer);
                        resolve();
                    },
                    reject: (error) => {
                        clearTimeout(timer);
                        reject(error);
                    },
                });
            });
        }

        entry = live.get(key);
        if (!entry || entry.status !== "connected" || !entry.sock) throw notConnectedError();
        return entry;
    }

    async function pace(entry) {
        const wait = (entry.lastSendAt || 0) + minGapMs - now();
        if (wait > 0) await sleep(wait);
        entry.lastSendAt = now();
    }

    async function resolveRecipient(entry, phone) {
        const jid = toWhatsAppJid(phone);
        if (!jid) {
            throw new WhatsAppSessionError(
                "VALIDATION_FAILED",
                "This phone number is not valid for WhatsApp"
            );
        }
        const listed = await entry.sock.onWhatsApp(jid);
        const match = (listed || []).find((row) => row.exists && row.jid);
        if (!match) {
            throw new WhatsAppSessionError(
                NOT_ON_WHATSAPP,
                "This phone number is not registered on WhatsApp."
            );
        }
        return match.jid;
    }

    async function sendText({ tenantId, userId, phone, text }) {
        const entry = await ensureConnected({ tenantId, userId });
        await pace(entry);
        const jid = await resolveRecipient(entry, phone);
        let sendTimer;
        try {
            const result = await Promise.race([
                entry.sock.sendMessage(jid, { text }),
                new Promise((_, reject) => {
                    sendTimer = setTimeout(
                        () => reject(new WhatsAppSessionError("WHATSAPP_TIMEOUT", "WhatsApp message send timed out.")),
                        sendTimeoutMs
                    );
                }),
            ]);
            return { status: "sent", messageId: result?.key?.id || null };
        } finally {
            if (sendTimer) clearTimeout(sendTimer);
        }
    }

    async function sendImage({ tenantId, userId, phone, image, caption }) {
        const entry = await ensureConnected({ tenantId, userId });
        await pace(entry);
        const jid = await resolveRecipient(entry, phone);
        let sendTimer;
        try {
            const result = await Promise.race([
                entry.sock.sendMessage(jid, {
                    image,
                    ...(caption ? { caption } : {}),
                }),
                new Promise((_, reject) => {
                    sendTimer = setTimeout(
                        () => reject(new WhatsAppSessionError("WHATSAPP_TIMEOUT", "WhatsApp image upload timed out. Media upload took too long.")),
                        sendTimeoutMs
                    );
                }),
            ]);
            return { status: "sent", messageId: result?.key?.id || null };
        } finally {
            if (sendTimer) clearTimeout(sendTimer);
        }
    }

    async function restoreConnected() {
        const rows = await listConnected();
        for (let i = 0; i < rows.length; i += RESTORE_CONCURRENCY) {
            const batch = rows.slice(i, i + RESTORE_CONCURRENCY);
            await Promise.all(batch.map((row) =>
                start({
                    tenantId: String(row.tenantId),
                    userId: String(row.userId),
                }).catch((error) => {
                    logger.error("whatsapp", "Could not restore WhatsApp session", {
                        error: error.message,
                        userId: String(row.userId),
                    });
                })
            ));
        }
    }

    return {
        start,
        getStatus,
        logout,
        sendText,
        sendImage,
        restoreConnected,
    };
}

async function defaultPersistStatus({ tenantId, userId, status, phone, lastConnectedAt }) {
    const update = { status, userId };
    if (phone !== undefined) update.phone = phone;
    if (lastConnectedAt) update.lastConnectedAt = lastConnectedAt;
    await runWithTenant({ tenantId: String(tenantId) }, async () =>
        WhatsAppSession.findOneAndUpdate(
            { userId },
            { $set: { ...update, tenantId } },
            { upsert: true }
        )
    );
}

async function readSaved({ tenantId, userId }) {
    return runWithTenant({ tenantId: String(tenantId) }, async () =>
        WhatsAppSession.findOne({ userId }).select("phone status").lean()
    );
}

async function defaultListConnected() {
    return runAsPlatform(async () =>
        WhatsAppSession.find({ status: "connected" }).select("tenantId userId").lean()
    );
}

const sessions = createSessionManager();

module.exports = {
    createSessionManager,
    WhatsAppSessionError,
    startSession: (args) => sessions.start(args),
    getSessionStatus: (args) => sessions.getStatus(args),
    logoutSession: (args) => sessions.logout(args),
    sendText: (args) => sessions.sendText(args),
    sendImage: (args) => sessions.sendImage(args),
    restoreConnectedSessions: () => sessions.restoreConnected(),
};
