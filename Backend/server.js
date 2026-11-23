const dotenv = require("dotenv");
dotenv.config();

// Before the rest of the app loads, so Sentry can hook into http and express.
const monitoring = require("./src/services/monitoring");
monitoring.init();

const storageService = require("./src/services/storageService");
const logger = require("./src/utils/logger");
const { validateEnv } = require("./src/config/validateEnv");

try {
    storageService.assertConfigured();
} catch (error) {
    logger.error("storage", error.message);
    process.exit(1);
}

if (process.env.NODE_ENV !== "test") {
    const { errors, warnings } = validateEnv(process.env);
    for (const warning of warnings) logger.warn("server", warning);
    if (errors.length) {
        for (const error of errors) logger.error("server", error);
        process.exit(1);
    }
}

const connectDB = require("./src/config/db");
const app = require("./src/app");
const { BCRYPT_ROUNDS } = require("./src/utils/passwordUtils");
const { startScheduledTasks, stopScheduledTasks } = require("./src/utils/scheduledTasks");
const { restoreConnectedSessions } = require("./src/services/whatsapp/sessionManager");
const { failInterruptedImports } = require("./src/services/memberImportRunner");
const { backfillPlanDescriptions } = require("./src/scripts/seedPlans");
const featureRollout = require("./src/services/featureRollout");
const featureSync = require("./src/services/featureSync");
const mongoose = require("mongoose");

connectDB();

const PORT = process.env.PORT || 5000;
// Slowloris / hung-connection defenses. headersTimeout must exceed keepAliveTimeout.
// requestTimeout covers long uploads; bulk import returns 202 and continues in-process.
const KEEP_ALIVE_TIMEOUT_MS = Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 60000;
const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS) || KEEP_ALIVE_TIMEOUT_MS + 5000;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 120000;

const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info("server", "Server started", {
        port: PORT,
        nodeEnv: process.env.NODE_ENV || "development",
        hasJwtSecret: Boolean(process.env.JWT_SECRET),
        hasMongoUri: Boolean(process.env.MONGO_URI),
        bcryptRounds: BCRYPT_ROUNDS,
        logLevel: process.env.LOG_LEVEL || "info",
        storageDriver: storageService.getDriverName(),
        storageBucket: storageService.bucketName(),
        keepAliveTimeoutMs: KEEP_ALIVE_TIMEOUT_MS,
        headersTimeoutMs: HEADERS_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        sharedRateLimits: Boolean(process.env.REDIS_URL),
    });
    if (!process.env.REDIS_URL) {
        logger.info(
            "server",
            "Rate limits are in-memory; pin Railway replicas=1 until REDIS_URL is set. WhatsApp Baileys also requires a single API replica."
        );
    }

    // Start background tasks (freeze auto-unfreeze, etc.)
    startScheduledTasks();
    const markInterrupted = () => {
        failInterruptedImports().catch((error) => {
            logger.error("import", "Could not close interrupted imports", { error: error.message });
        });
    };
    const onDbReady = () => {
        markInterrupted();
        featureSync.ensureSynced().then(() => featureRollout.refreshRules());
        backfillPlanDescriptions().catch((error) => {
            logger.warn("server", "Could not backfill plan descriptions", { error: error.message });
        });
        restoreConnectedSessions().catch((error) => {
            logger.error("whatsapp", "Could not restore WhatsApp sessions", { error: error.message });
        });
    };
    if (mongoose.connection.readyState === 1) onDbReady();
    else mongoose.connection.once("connected", onDbReady);
});

server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.timeout = REQUEST_TIMEOUT_MS;

// Graceful shutdown. Railway and Render send SIGTERM on every deploy: stop the
// scheduler, stop accepting new connections, let in-flight requests finish,
// then close Mongo. A hard timer guarantees the process still exits.
// Keep SHUTDOWN_GRACE_MS below REQUEST_TIMEOUT_MS; Railway drainingSeconds is 15.
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 10000;
let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server", "Shutdown signal received, draining", { signal, graceMs: SHUTDOWN_GRACE_MS });

    stopScheduledTasks();

    const forceExit = setTimeout(() => {
        logger.warn("server", "Shutdown grace period elapsed, forcing exit");
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
        process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    server.close(async () => {
        await monitoring.flush();
        try {
            await mongoose.connection.close(false);
        } catch (error) {
            logger.warn("server", "Mongo close failed during shutdown", { error: error.message });
        }
        logger.info("server", "Shutdown complete");
        process.exit(0);
    });
    // Idle keep-alive sockets would otherwise hold server.close() open.
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Process-level safety: gracefully log and handle unhandled rejections and exceptions
process.on("unhandledRejection", (reason) => {
    logger.error("process", "Unhandled Promise Rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
    monitoring.captureException(reason, { tags: { area: "process", kind: "unhandled_rejection" } });
});

process.on("uncaughtException", (error) => {
    logger.error("process", "Uncaught Exception - terminating process safely", {
        error: error.message,
        stack: error.stack,
    });
    monitoring.captureException(error, { tags: { area: "process", kind: "uncaught_exception" } });
    if (server && server.close) {
        server.close(async () => {
            await monitoring.flush();
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
});

module.exports = server;
