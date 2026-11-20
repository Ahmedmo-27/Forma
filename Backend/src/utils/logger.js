const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
const AUTH_LOG_FILE = path.join(LOG_DIR, "auth.log");
const HTTP_LOG_FILE = path.join(LOG_DIR, "http.log");
const ERRORS_LOG_FILE = path.join(LOG_DIR, "errors.log");

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function formatLine(level, category, message, meta = {}) {
    return JSON.stringify({
        ts: new Date().toISOString(),
        level,
        category,
        message,
        env: process.env.NODE_ENV || "development",
        ...meta,
    });
}

// Hosted platforms (Railway, Render) have an ephemeral filesystem and collect
// stdout instead. Log files stay on by default everywhere else; set
// LOG_TO_FILE=true|false to override.
const FILE_LOGGING = process.env.LOG_TO_FILE
    ? process.env.LOG_TO_FILE.toLowerCase() !== "false"
    : process.env.NODE_ENV !== "production";

function writeToFile(filePath, line) {
    if (!FILE_LOGGING) return;
    try {
        ensureLogDir();
        fs.appendFileSync(filePath, `${line}\n`, "utf8");
    } catch (err) {
        console.error("[logger] Failed to write log file:", err.message);
    }
}

function log(level, category, message, meta = {}, options = {}) {
    if (LEVELS[level] < MIN_LEVEL) return;

    const line = formatLine(level, category, message, meta);
    const prefix = `[${level.toUpperCase()}][${category}]`;

    if (level === "error") {
        console.error(prefix, message, meta);
    } else if (level === "warn") {
        console.warn(prefix, message, meta);
    } else {
        console.log(prefix, message, Object.keys(meta).length ? meta : "");
    }

    writeToFile(LOG_FILE, line);

    if (options.auth || category === "auth") {
        writeToFile(AUTH_LOG_FILE, line);
    }
    if (options.http || category === "http") {
        writeToFile(HTTP_LOG_FILE, line);
    }
    if (level === "error") {
        writeToFile(ERRORS_LOG_FILE, line);
    }
}

const logger = {
    debug: (category, message, meta, options) => log("debug", category, message, meta, options),
    info: (category, message, meta, options) => log("info", category, message, meta, options),
    warn: (category, message, meta, options) => log("warn", category, message, meta, options),
    error: (category, message, meta, options) => log("error", category, message, meta, options),
    auth: (level, message, meta = {}) => log(level, "auth", message, meta, { auth: true }),
    http: (level, message, meta = {}) => log(level, "http", message, meta, { http: true }),
};

module.exports = logger;
