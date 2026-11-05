const AuditLog = require("../models/AuditLog");
const logger = require("./logger");

async function writeAudit({ action, actor, actorRole, targetType, targetId, meta, req }) {
    try {
        const enrichedMeta = { ...(meta || {}) };
        if (req?.user?.impersonatedBy) {
            enrichedMeta.impersonatedBy = req.user.impersonatedBy;
            enrichedMeta.isImpersonation = true;
            enrichedMeta.platformAdminName = req.user.platformAdminName || null;
        }

        await AuditLog.create({
            action,
            actor,
            actorRole: actorRole || null,
            targetType: targetType || "other",
            targetId: targetId != null ? String(targetId) : null,
            meta: enrichedMeta,
            ip: req?.ip || null,
            requestId: req?.requestId || req?.headers?.["x-request-id"] || null,
        });
    } catch (err) {
        logger.error("audit", "Failed to write audit log", {
            action,
            error: err.message,
        });
    }
}

module.exports = { writeAudit };
