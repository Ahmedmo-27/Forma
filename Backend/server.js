const dotenv = require("dotenv");
dotenv.config();

const storageService = require("./src/services/storageService");
const logger = require("./src/utils/logger");

try {
    storageService.assertConfigured();
} catch (error) {
    logger.error("storage", error.message);
    process.exit(1);
}

if (process.env.NODE_ENV !== "test") {
    const missingSecrets = [];
    if (!process.env.JWT_SECRET) missingSecrets.push("JWT_SECRET");
    if (!process.env.PLATFORM_JWT_SECRET) missingSecrets.push("PLATFORM_JWT_SECRET");
    if (!process.env.TENANT_SECRET_KEY) missingSecrets.push("TENANT_SECRET_KEY");
    if (missingSecrets.length) {
        logger.error("server", `Missing required secrets: ${missingSecrets.join(", ")}`);
        process.exit(1);
    }
}

const connectDB = require("./src/config/db");
const app = require("./src/app");
const { BCRYPT_ROUNDS } = require("./src/utils/passwordUtils");
const { startScheduledTasks } = require("./src/utils/scheduledTasks");
const { restoreConnectedSessions } = require("./src/services/whatsapp/sessionManager");
const { failInterruptedImports } = require("./src/services/memberImportRunner");
const mongoose = require("mongoose");

connectDB();

const PORT = process.env.PORT || 5000;
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
    });

    // Start background tasks (freeze auto-unfreeze, etc.)
    startScheduledTasks();
    const markInterrupted = () => {
        failInterruptedImports().catch((error) => {
            logger.error("import", "Could not close interrupted imports", { error: error.message });
        });
    };
    const onDbReady = () => {
        markInterrupted();
        restoreConnectedSessions().catch((error) => {
            logger.error("whatsapp", "Could not restore WhatsApp sessions", { error: error.message });
        });
    };
    if (mongoose.connection.readyState === 1) onDbReady();
    else mongoose.connection.once("connected", onDbReady);
});

// Process-level safety: gracefully log and handle unhandled rejections and exceptions
process.on("unhandledRejection", (reason) => {
    logger.error("process", "Unhandled Promise Rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
});

process.on("uncaughtException", (error) => {
    logger.error("process", "Uncaught Exception - terminating process safely", {
        error: error.message,
        stack: error.stack,
    });
    if (server && server.close) {
        server.close(() => {
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
});

module.exports = server;
