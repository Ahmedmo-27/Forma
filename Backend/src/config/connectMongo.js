const mongoose = require("mongoose");
const dns = require("dns").promises;

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

function parseSrvUri(srvUri) {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^/]+)@([^/?]+)(?:\/([^?]*))?(?:\?(.*))?$/);
  if (!match) return null;

  const [, credentials, host, dbName = "test", query = ""] = match;
  return { credentials, host, dbName, query };
}

async function resolveAtlasStandardUri(srvUri) {
  const parsed = parseSrvUri(srvUri);
  if (!parsed) return srvUri;

  const { credentials, host, dbName, query } = parsed;
  const [srvRecords, txtRecords] = await Promise.all([
    dns.resolveSrv(`_mongodb._tcp.${host}`),
    dns.resolveTxt(host).catch(() => []),
  ]);

  const hosts = srvRecords.map((record) => `${record.name}:${record.port}`).join(",");
  const params = new URLSearchParams(query);

  txtRecords.flat().forEach((entry) => {
    entry.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      if (key && value && !params.has(key)) params.set(key, value);
    });
  });

  params.set("ssl", "true");
  if (!params.has("authSource")) params.set("authSource", "admin");
  if (!params.has("retryWrites")) params.set("retryWrites", "true");
  if (!params.has("w")) params.set("w", "majority");

  return `mongodb://${credentials}@${hosts}/${dbName}?${params.toString()}`;
}

function isSrvLookupError(err) {
  return (
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND" ||
    err.code === "ESERVFAIL" ||
    err.message?.includes("querySrv") ||
    err.message?.includes("queryTxt")
  );
}

function isReplicaSetError(err) {
  return (
    err.name === "MongooseServerSelectionError" ||
    err.message?.includes("ReplicaSetNoPrimary") ||
    err.message?.includes("Server selection timed out")
  );
}

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

// Defaults sized for a single API replica. Keep replicas × maxPoolSize under the Atlas connection limit.
const connectOptions = {
  // Fail faster than the SPA's 15s axios timeout so cold-start hangs surface cleanly.
  serverSelectionTimeoutMS: 10000,
  family: 4,
  maxPoolSize: positiveIntEnv("MONGO_MAX_POOL_SIZE", 20),
  minPoolSize: positiveIntEnv("MONGO_MIN_POOL_SIZE", 0),
  maxIdleTimeMS: positiveIntEnv("MONGO_MAX_IDLE_TIME_MS", 30000),
  socketTimeoutMS: positiveIntEnv("MONGO_SOCKET_TIMEOUT_MS", 45000),
};

function logConnected() {
  console.log("MongoDB connected", {
    maxPoolSize: connectOptions.maxPoolSize,
    minPoolSize: connectOptions.minPoolSize,
    maxIdleTimeMS: connectOptions.maxIdleTimeMS,
    socketTimeoutMS: connectOptions.socketTimeoutMS,
  });
}

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set in .env");
  }

  if (process.env.MONGO_URI_STANDARD) {
    await mongoose.connect(process.env.MONGO_URI_STANDARD, connectOptions);
    logConnected();
    return;
  }

  if (!uri.startsWith("mongodb+srv://")) {
    await mongoose.connect(uri, connectOptions);
    logConnected();
    return;
  }

  try {
    await mongoose.connect(uri, connectOptions);
    logConnected();
    return;
  } catch (err) {
    if (!isSrvLookupError(err) && !isReplicaSetError(err)) throw err;
  }

  console.warn("SRV connection failed, resolving Atlas hosts manually...");
  const standardUri = await resolveAtlasStandardUri(uri);
  await mongoose.connect(standardUri, connectOptions);
  logConnected();
}

module.exports = connectMongo;
