const fs = require("fs");
const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Member = require("../models/Member");
const Package = require("../models/Package");
const AuditLog = require("../models/AuditLog");
const BillingEvent = require("../models/BillingEvent");
const WhatsAppTemplate = require("../models/WhatsAppTemplate");
const CoachRepRequest = require("../models/CoachRepRequest");
const SalesRepRequest = require("../models/SalesRepRequest");
const PackageExceptionRequest = require("../models/PackageExceptionRequest");
const ProfileView = require("../models/ProfileView");
const TenantNote = require("../models/TenantNote");
const Announcement = require("../models/Announcement");
const storageService = require("../services/storageService");
const { runAsPlatform } = require("../context/tenantContext");
const { parsePagination, buildPagination } = require("../utils/pagination");
const logger = require("../utils/logger");

// ==========================================
// 1. Secure Audited Impersonation
// ==========================================

async function createImpersonationSession(req, res) {
    try {
        const tenantId = req.body?.tenantId || req.params?.id;
        const { mode = "read_only", reason } = req.body || {};
        if (!tenantId) return res.status(400).json({ message: "tenantId is required" });

        const isWriteMode = mode === "read_write";
        if (isWriteMode) {
            if (req.platformUser.role !== "super_admin") {
                return res.status(403).json({
                    message: "Read-write impersonation is strictly restricted to platform super_admins",
                });
            }
            if (!reason || !reason.trim()) {
                return res.status(400).json({
                    message: "Mandatory 'reason' required for read-write impersonation sessions",
                });
            }
        }

        return runAsPlatform(async () => {
            const tenant = await Tenant.findById(tenantId);
            if (!tenant) return res.status(404).json({ message: "Tenant not found" });

            let targetUser = await User.findOne({ tenantId: tenant._id, role: "Owner" });
            if (!targetUser) {
                targetUser = await User.findOne({ tenantId: tenant._id });
            }

            if (!targetUser) {
                return res.status(404).json({ message: "No user found in tenant gym to impersonate" });
            }

            // Write immutable audit log before token issue
            await AuditLog.create({
                tenantId: tenant._id,
                action: "platform_impersonation",
                actor: req.platformUser.id,
                actorRole: "PlatformUser",
                targetType: "tenant",
                targetId: tenant._id.toString(),
                meta: {
                    platformAdminId: req.platformUser.id,
                    platformAdminEmail: req.platformUser.email,
                    impersonatedUserId: targetUser._id.toString(),
                    impersonatedUserRole: targetUser.role,
                    mode,
                    reason: reason || "Support investigation",
                },
            });

            // 30-minute strictly time-limited tenant token
            const token = jwt.sign(
                {
                    id: targetUser._id.toString(),
                    role: targetUser.role,
                    tenantId: tenant._id.toString(),
                    tenantSlug: tenant.slug,
                    isImpersonation: true,
                    impersonatedBy: req.platformUser.id,
                    platformAdminName: req.platformUser.name,
                    readOnly: !isWriteMode,
                },
                process.env.JWT_SECRET,
                { expiresIn: "30m" }
            );

            res.json({
                message: `Impersonation session initiated for ${tenant.name} (${mode})`,
                token,
                session: {
                    mode,
                    expiresInMinutes: 30,
                    tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug },
                    user: { id: targetUser._id, name: targetUser.name, role: targetUser.role },
                    admin: { id: req.platformUser.id, name: req.platformUser.name },
                },
            });
        });
    } catch (err) {
        logger.error("platform", "createImpersonationSession error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 2. Tenant Data Export
// ==========================================

async function exportTenantData(req, res) {
    try {
        const { id } = req.params;
        return runAsPlatform(async () => {
            const tenant = await Tenant.findById(id).select("-settings.whatsapp.accessToken");
            if (!tenant) return res.status(404).json({ message: "Tenant not found" });

            const [
                members,
                staff,
                packages,
                notes,
                auditLogs,
                billingEvents,
            ] = await Promise.all([
                Member.find({ tenantId: tenant._id }).select("-password"),
                User.find({ tenantId: tenant._id }).select("-password"),
                Package.find({ tenantId: tenant._id }),
                TenantNote.find({ tenantId: tenant._id }),
                AuditLog.find({ tenantId: tenant._id }).limit(500),
                BillingEvent.find({ tenantId: tenant._id }),
            ]);

            const exportPayload = {
                exportMetadata: {
                    exportedAt: new Date().toISOString(),
                    exportedBy: req.platformUser.email,
                    tenantSlug: tenant.slug,
                    tenantName: tenant.name,
                },
                tenant,
                staff,
                members,
                packages,
                notes,
                billingEvents,
                auditLogs,
            };

            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Disposition", `attachment; filename="tenant-export-${tenant.slug}.json"`);
            res.send(JSON.stringify(exportPayload, null, 2));
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 3. Super Admin Hard Purge
// ==========================================

async function purgeTenant(req, res) {
    try {
        const { id } = req.params;
        const { slugConfirmation, reason } = req.body;

        if (!slugConfirmation || !reason || !reason.trim()) {
            return res.status(400).json({
                message: "Confirmation requires typing the exact tenant slug and providing a mandatory reason",
            });
        }

        return runAsPlatform(async () => {
            const tenant = await Tenant.findById(id);
            if (!tenant) return res.status(404).json({ message: "Tenant not found" });

            if (slugConfirmation.trim().toLowerCase() !== tenant.slug.toLowerCase()) {
                return res.status(400).json({
                    message: `Slug confirmation mismatch. Provided '${slugConfirmation}', expected '${tenant.slug}'.`,
                });
            }

            const tenantId = tenant._id;

            // Delete documents across all collections
            const [
                deletedMembers,
                deletedUsers,
                deletedPackages,
                deletedTemplates,
                deletedNotes,
            ] = await Promise.all([
                Member.deleteMany({ tenantId }),
                User.deleteMany({ tenantId }),
                Package.deleteMany({ tenantId }),
                WhatsAppTemplate.deleteMany({ tenantId }),
                TenantNote.deleteMany({ tenantId }),
                CoachRepRequest.deleteMany({ tenantId }),
                SalesRepRequest.deleteMany({ tenantId }),
                PackageExceptionRequest.deleteMany({ tenantId }),
                ProfileView.deleteMany({ tenantId }),
            ]);

            // Delete storage directory on disk
            try {
                const tenantDir = storageService.getTenantDir(tenantId);
                if (fs.existsSync(tenantDir)) {
                    fs.rmSync(tenantDir, { recursive: true, force: true });
                }
            } catch (storageErr) {
                logger.warn("platform", "Failed to clean disk storage during purge", { error: storageErr.message });
            }

            // Delete Tenant document
            await Tenant.findByIdAndDelete(tenantId);

            // Write permanent tombstone audit log with tenantId = null so it survives
            await AuditLog.create({
                tenantId: null,
                action: "tenant_status_updated",
                actor: req.platformUser.id,
                actorRole: "PlatformUser",
                targetType: "tenant",
                targetId: tenantId.toString(),
                meta: {
                    action: "tenant_purged",
                    purgedSlug: tenant.slug,
                    purgedName: tenant.name,
                    reason,
                    actorEmail: req.platformUser.email,
                    deletedCounts: {
                        members: deletedMembers.deletedCount,
                        staff: deletedUsers.deletedCount,
                        packages: deletedPackages.deletedCount,
                        templates: deletedTemplates.deletedCount,
                        notes: deletedNotes.deletedCount,
                    },
                },
            });

            res.json({
                message: `Tenant '${tenant.name}' (${tenant.slug}) and all related data purged permanently.`,
                purgedTenantSlug: tenant.slug,
            });
        });
    } catch (err) {
        logger.error("platform", "purgeTenant error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 4. Announcements
// ==========================================

async function getAnnouncements(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const { type, isActive, search } = req.query || {};

        const filter = {};
        if (type) filter.type = type;
        if (isActive !== undefined && isActive !== "") {
            filter.isActive = isActive === "true" || isActive === true;
        }
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            filter.$or = [{ title: regex }, { message: regex }];
        }

        const [announcements, total] = await Promise.all([
            Announcement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Announcement.countDocuments(filter),
        ]);

        res.json({
            announcements,
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function createAnnouncement(req, res) {
    try {
        const { title, message, type, target, startDate, endDate, isActive } = req.body;
        if (!title || !message) {
            return res.status(400).json({ message: "Title and message are required" });
        }

        const announcement = await Announcement.create({
            title: title.trim(),
            message: message.trim(),
            type: type || "info",
            target: target || { type: "all" },
            startDate: startDate || new Date(),
            endDate: endDate || null,
            isActive: isActive !== false,
            createdBy: req.platformUser.id,
        });

        res.status(201).json(announcement);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function updateAnnouncement(req, res) {
    try {
        const { id } = req.params;
        const announcement = await Announcement.findByIdAndUpdate(id, req.body, { new: true });
        if (!announcement) return res.status(404).json({ message: "Announcement not found" });
        res.json(announcement);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function deleteAnnouncement(req, res) {
    try {
        const { id } = req.params;
        await Announcement.findByIdAndDelete(id);
        res.json({ message: "Announcement deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 5. Platform Audit Log Viewer
// ==========================================

async function getPlatformAuditLogs(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25 });

        const { tenantId, action, actor, fromDate, toDate } = req.query;
        const filter = {};
        if (tenantId) filter.tenantId = tenantId;
        if (action) filter.action = action;
        if (actor) filter.actor = actor;
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        return runAsPlatform(async () => {
            const [logs, total] = await Promise.all([
                AuditLog.find(filter)
                    .populate("tenantId", "name slug")
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                AuditLog.countDocuments(filter),
            ]);

            res.json({
                logs,
                pagination: buildPagination(page, limit, total),
            });
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    createImpersonationSession,
    impersonateTenant: createImpersonationSession,
    exportTenantData,
    purgeTenant,
    getAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getPlatformAuditLogs,
};
