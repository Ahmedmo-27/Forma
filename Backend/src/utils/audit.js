const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const AuditDeadLetter = require("../models/AuditDeadLetter");
const { runAsPlatform, getTenantId } = require("../context/tenantContext");
const logger = require("./logger");
const monitoring = require("../services/monitoring");

const MAX_ATTEMPTS = 3;

const stats = {
    written: 0,
    retried: 0,
    deadLettered: 0,
    lost: 0,
    lastFailureAt: null,
    lastError: null,
};

function retryBaseMs() {
    if (process.env.NODE_ENV === "test") return 0;
    const configured = Number(process.env.AUDIT_RETRY_BASE_MS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 100;
}

function sleep(ms) {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Errors that will fail the same way on every attempt. */
function isPermanent(error) {
    if (!error) return false;
    if (error.name === "ValidationError" || error.name === "CastError" || error.name === "StrictModeError") return true;
    return /TenantContextMissingError|TenantIsolationViolationError/.test(error.message || "");
}

function dbReady() {
    return mongoose.connection.readyState === 1;
}

async function deadLetter(doc, error, attempts) {
    stats.lastFailureAt = new Date();
    stats.lastError = error?.message || String(error);
    const context = {
        tags: { area: "audit", action: doc.action, scope: doc.scope || "tenant" },
        tenantId: doc.tenantId || null,
        requestId: doc.requestId || null,
        extra: { attempts, targetType: doc.targetType, targetId: doc.targetId },
    };
    logger.error("audit", "Audit write failed after retries", {
        action: doc.action,
        attempts,
        error: stats.lastError,
        requestId: doc.requestId || null,
    });
    monitoring.captureException(error || new Error("Audit write failed"), context);

    try {
        // Without a live connection Mongoose would buffer the insert for 10s and then fail anyway.
        if (!dbReady()) throw new Error("MongoDB is not connected");
        await runAsPlatform(
            () => AuditDeadLetter.create({ payload: doc, error: stats.lastError, attempts }),
            { reason: "audit_dead_letter" }
        );
        stats.deadLettered += 1;
    } catch (fallbackError) {
        stats.lost += 1;
        // Last resort: the full row goes to the error log so it can be replayed by hand.
        logger.error("audit", "AUDIT_LOST: dead-letter write failed", {
            payload: doc,
            error: fallbackError.message,
        });
        monitoring.captureMessage("Audit row lost: dead-letter write failed", "error", context);
    }
}

async function persist(doc, { platform }) {
    const create = () => AuditLog.create(doc);
    return platform ? runAsPlatform(create, { reason: "platform_audit" }) : create();
}

async function writeWithRetry(doc, options) {
    let lastError = null;
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
        attempts += 1;
        try {
            await persist(doc, options);
            stats.written += 1;
            return true;
        } catch (error) {
            lastError = error;
            if (isPermanent(error) || attempts >= MAX_ATTEMPTS) break;
            stats.retried += 1;
            await sleep(retryBaseMs() * 2 ** (attempts - 1));
        }
    }
    await deadLetter(doc, lastError, attempts);
    return false;
}

function buildDoc({ action, actor, actorRole, targetType, targetId, meta, req }) {
    const enrichedMeta = { ...(meta || {}) };
    if (req?.user?.impersonatedBy) {
        enrichedMeta.impersonatedBy = req.user.impersonatedBy;
        enrichedMeta.isImpersonation = true;
        enrichedMeta.platformAdminName = req.user.platformAdminName || null;
    }
    return {
        action,
        actor,
        actorRole: actorRole || null,
        targetType: targetType || "other",
        targetId: targetId != null ? String(targetId) : null,
        meta: enrichedMeta,
        ip: req?.ip || null,
        requestId: req?.requestId || req?.headers?.["x-request-id"] || null,
    };
}

/**
 * Tenant audit row, stamped from the active tenant context. Never throws:
 * resolves true when written, false when it went to the dead-letter store.
 */
async function writeAudit(entry) {
    const doc = buildDoc(entry);
    // Copied up front so a dead-lettered row can be replayed outside the request context.
    const tenantId = getTenantId();
    if (tenantId) doc.tenantId = tenantId;
    return writeWithRetry(doc, { platform: false });
}

/**
 * Console audit row. Pass `tenantId` when the action targets one gym; omit it
 * for platform-wide actions (operators, plans, purges). Never throws.
 */
async function writePlatformAudit({ tenantId = null, ...entry }) {
    const doc = buildDoc({ actorRole: "PlatformUser", ...entry });
    doc.scope = tenantId ? "tenant" : "platform";
    doc.tenantId = tenantId || null;
    return writeWithRetry(doc, { platform: true });
}

/** Retry dead-lettered rows. Rows that still fail stay for the next run. */
async function replayDeadLetters({ limit = 100 } = {}) {
    if (!dbReady()) return { scanned: 0, replayed: 0, skipped: "db_not_connected" };
    return runAsPlatform(async () => {
        const rows = await AuditDeadLetter.find({ replayedAt: null }).sort({ createdAt: 1 }).limit(limit);
        let replayed = 0;
        for (const row of rows) {
            try {
                await AuditLog.create(row.payload);
                row.replayedAt = new Date();
                await row.save();
                replayed += 1;
            } catch (error) {
                row.attempts = (row.attempts || 0) + 1;
                row.error = error.message;
                await row.save().catch(() => {});
            }
        }
        return { scanned: rows.length, replayed };
    }, { reason: "audit_dead_letter_replay" });
}

async function getAuditHealth() {
    let pendingDeadLetters = null;
    if (!dbReady()) return { ...stats, pendingDeadLetters };
    try {
        pendingDeadLetters = await runAsPlatform(
            () => AuditDeadLetter.countDocuments({ replayedAt: null }),
            { reason: "audit_health" }
        );
    } catch {
        pendingDeadLetters = null;
    }
    return { ...stats, pendingDeadLetters };
}

module.exports = { writeAudit, writePlatformAudit, replayDeadLetters, getAuditHealth, _stats: stats };
