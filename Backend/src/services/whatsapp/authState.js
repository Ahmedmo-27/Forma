const { runWithTenant } = require("../../context/tenantContext");
const WhatsAppAuth = require("../../models/WhatsAppAuth");
const { encryptSecret, decryptSecret } = require("../../utils/tenantCrypto");

let cachedUtils;

async function baileysAuthUtils() {
    if (!cachedUtils) {
        const mod = await import("@whiskeysockets/baileys");
        cachedUtils = {
            BufferJSON: mod.BufferJSON,
            initAuthCreds: mod.initAuthCreds,
            proto: mod.proto,
        };
    }
    return cachedUtils;
}

function inTenant(tenantId, fn) {
    return runWithTenant({ tenantId: String(tenantId) }, fn);
}

function parsePayload(payload, BufferJSON) {
    const json = decryptSecret(payload);
    if (!json) return null;
    try {
        return JSON.parse(json, BufferJSON.reviver);
    } catch {
        return null;
    }
}

/**
 * Baileys AuthenticationState backed by encrypted Mongo documents.
 * Callbacks from the socket run outside the request, so every read and write
 * re-enters the tenant context captured when the session started.
 */
async function useMongoAuthState({ tenantId, userId }) {
    const { BufferJSON, initAuthCreds, proto } = await baileysAuthUtils();
    const uid = userId;

    const credsDoc = await inTenant(tenantId, async () =>
        WhatsAppAuth.findOne({ userId: uid, kind: "creds" }).lean()
    );
    const creds = (credsDoc?.payload && parsePayload(credsDoc.payload, BufferJSON)) || initAuthCreds();

    async function saveCreds() {
        const payload = encryptSecret(JSON.stringify(creds, BufferJSON.replacer));
        await inTenant(tenantId, async () =>
            WhatsAppAuth.findOneAndUpdate(
                { userId: uid, kind: "creds", keyType: "", keyId: "" },
                {
                    $set: {
                        userId: uid,
                        kind: "creds",
                        keyType: "",
                        keyId: "",
                        payload,
                        tenantId,
                    },
                },
                { upsert: true }
            )
        );
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    if (!ids?.length) return data;
                    const docs = await inTenant(tenantId, async () =>
                        WhatsAppAuth.find({
                            userId: uid,
                            kind: "key",
                            keyType: type,
                            keyId: { $in: ids.map(String) },
                        }).lean()
                    );
                    const byId = new Map(docs.map((doc) => [String(doc.keyId), doc.payload]));
                    for (const id of ids) {
                        const payload = byId.get(String(id));
                        let value = payload ? parsePayload(payload, BufferJSON) : null;
                        if (type === "app-state-sync-key" && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category of Object.keys(data || {})) {
                        for (const id of Object.keys(data[category] || {})) {
                            const value = data[category][id];
                            const filter = {
                                userId: uid,
                                kind: "key",
                                keyType: category,
                                keyId: String(id),
                            };
                            if (value) {
                                const payload = encryptSecret(JSON.stringify(value, BufferJSON.replacer));
                                tasks.push(inTenant(tenantId, async () =>
                                    WhatsAppAuth.findOneAndUpdate(
                                        filter,
                                        { $set: { ...filter, payload, tenantId } },
                                        { upsert: true }
                                    )
                                ));
                            } else {
                                tasks.push(inTenant(tenantId, async () => WhatsAppAuth.deleteOne(filter)));
                            }
                        }
                    }
                    if (tasks.length) await Promise.all(tasks);
                },
            },
        },
        saveCreds,
    };
}

async function hasStoredCreds({ tenantId, userId }) {
    const count = await inTenant(tenantId, async () =>
        WhatsAppAuth.countDocuments({ userId, kind: "creds" })
    );
    return count > 0;
}

async function clearStoredAuth({ tenantId, userId }) {
    await inTenant(tenantId, async () => WhatsAppAuth.deleteMany({ userId }));
}

module.exports = {
    useMongoAuthState,
    hasStoredCreds,
    clearStoredAuth,
};
