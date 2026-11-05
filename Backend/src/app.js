const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const Member = require("./models/Member");
const userRoutes = require("./routes/userRoutes");
const membersRoutes = require("./routes/membersRoutes");
const salesRequestRoutes = require("./routes/salesRequestRoutes");
const packageRoutes = require("./routes/packageRoutes");
const packageExceptionRoutes = require("./routes/packageExceptionRoutes");
const whatsappTemplateRoutes = require("./routes/whatsappTemplateRoutes");
const contractRoutes = require("./routes/contractRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const requestId = require("./middleware/requestId");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const sanitizeRequest = require("./middleware/sanitize");
const { protect } = require("./middleware/authMiddleware");
const authorize = require("./middleware/roleMiddleware");
const { writeAudit } = require("./utils/audit");
const { detectMimeFromFile, MIME_TO_EXT } = require("./utils/fileMagic");
const coachRequestRoutes = require("./routes/coachRequestRoutes");
const tenantRoutes = require("./routes/tenantRoutes");


const app = express();
app.set("trust proxy", 1);

// Browser Origin never has a trailing slash — strip so misconfigured env still matches.
const frontendOrigin = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");

app.use(helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    // API responses; SPA CSP is set on Vercel
    contentSecurityPolicy: false,
}));

app.use(cors({
    origin: frontendOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    credentials: false,
}));

app.use(express.json({ limit: "100kb" }));
app.use(sanitizeRequest);
app.use(requestId);
app.use(requestLogger);

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, try again later" },
});
app.use("/api", globalLimiter);

app.get("/", (req, res) => {
    res.send("Flame Factory API is running");
});

app.use("/api/users", userRoutes);
app.use("/api/members", membersRoutes);
app.use("/api/sales-requests", salesRequestRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/package-exceptions", packageExceptionRoutes);
app.use("/api/whatsapp-templates", whatsappTemplateRoutes);
app.use("/api/accounting", contractRoutes);
app.use("/api/requests", salesRequestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/coach-requests", coachRequestRoutes);
app.use("/api/tenant", tenantRoutes);

const uploadsDir = path.resolve(__dirname, "../uploads");
const uploadReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many file requests, try again later" },
});

const storageService = require("./services/storageService");

function idOf(value) {
    return value?._id?.toString?.() || value?.toString?.() || null;
}

function isAssignedSales(member, user) {
    return Boolean(idOf(member.assignedSales) && idOf(member.assignedSales) === user.id.toString());
}

function uploadTypeForMember(member, filename) {
    if (member.photo === filename) return "profile_photo";
    if (member.nationalId === filename) return "national_id";
    if ((member.invitations || []).some((inv) => inv?.idFile === filename)) return "invitation_id";
    return null;
}

function canAccessMemberUpload(user, member, type) {
    // 1. Strict multi-tenant isolation: owning record must belong to current tenant
    if (user?.tenantId && member?.tenantId && String(member.tenantId) !== String(user.tenantId)) {
        return false;
    }

    const profileRoles = ["Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"];
    if (!profileRoles.includes(user.role)) return false;

    if (type === "profile_photo") return true;

    const sensitiveFileRoles = ["Receptionist", "Owner", "Sales Manager", "Coach Manager", "Accountant"];
    if (sensitiveFileRoles.includes(user.role)) return true;

    return user.role === "Sales" && isAssignedSales(member, user);
}

/**
 * Uploaded files are PII — require auth and member ownership checks.
 * Do not use public express.static for uploads.
 */
app.get(
    "/uploads/:filename",
    uploadReadLimiter,
    protect,
    authorize("Receptionist", "Owner", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"),
    async (req, res) => {
        const safe = path.basename(req.params.filename);
        if (safe !== req.params.filename || safe.includes("..")) {
            return res.status(400).json({ message: "Invalid filename" });
        }

        // Check tenant directory first, fallback to root uploads for unmigrated legacy files
        let filePath = req.user?.tenantId
            ? path.resolve(storageService.getTenantDir(req.user.tenantId), safe)
            : path.resolve(uploadsDir, safe);

        if (!fs.existsSync(filePath)) {
            // Fallback check in root uploadsDir
            const fallbackPath = path.resolve(uploadsDir, safe);
            if (fs.existsSync(fallbackPath) && path.dirname(fallbackPath) === uploadsDir) {
                filePath = fallbackPath;
            } else {
                return res.status(404).json({ message: "File not found" });
            }
        }

        // Check if file is a tenant logo
        if (safe.startsWith("logo-") || (req.tenant?.settings?.branding?.logoKey && req.tenant.settings.branding.logoKey.includes(safe))) {
            const mime = await detectMimeFromFile(filePath);
            if (!mime) return res.status(404).json({ message: "File not found" });
            res.setHeader("Content-Type", mime);
            res.setHeader("X-Content-Type-Options", "nosniff");
            return res.sendFile(filePath);
        }

        const member = await Member.findOne({
            $or: [
                { photo: safe },
                { nationalId: safe },
                { "invitations.idFile": safe },
            ],
        })
            .select("photo nationalId invitations.idFile assignedSales current_couch tenantId")
            .lean();

        const uploadType = member ? uploadTypeForMember(member, safe) : null;
        if (!member || !uploadType || !canAccessMemberUpload(req.user, member, uploadType)) {
            return res.status(404).json({ message: "File not found" });
        }

        const mime = await detectMimeFromFile(filePath);
        if (!mime || !MIME_TO_EXT[mime]?.some((ext) => safe.toLowerCase().endsWith(ext))) {
            return res.status(404).json({ message: "File not found" });
        }

        await writeAudit({
            action: "upload_accessed",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "upload",
            targetId: safe,
            meta: { memberId: member._id, uploadType },
            req,
        });

        const headerName = safe.replace(/["\r\n]/g, "");
        res.setHeader("Content-Type", mime);
        res.setHeader("Content-Disposition", `${mime === "application/pdf" ? "attachment" : "inline"}; filename="${headerName}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.sendFile(filePath);
    }
);

app.use(errorHandler);

module.exports = app;
