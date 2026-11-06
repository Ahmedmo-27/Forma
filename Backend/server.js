const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("./src/config/db");
const app = require("./src/app");
const logger = require("./src/utils/logger");
const { BCRYPT_ROUNDS } = require("./src/utils/passwordUtils");
const { startScheduledTasks } = require("./src/utils/scheduledTasks");

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
    });

    // Start background tasks (freeze auto-unfreeze, etc.)
    startScheduledTasks();
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
