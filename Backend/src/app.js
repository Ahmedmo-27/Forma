const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const Member = require("./models/Member");
const userRoutes = require("./routes/userRoutes");
const membersRoutes = require("./routes/membersRoutes");
const salesRequestRoutes = require("./routes/salesRequestRoutes");
const packageRoutes = require("./routes/packageRoutes");
const packageExceptionRoutes = require("./routes/packageExceptionRoutes");
const whatsappTemplateRoutes = require("./routes/whatsappTemplateRoutes");
const whatsappSessionRoutes = require("./routes/whatsappSessionRoutes");
const contractRoutes = require("./routes/contractRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const requestId = require("./middleware/requestId");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const sanitizeRequest = require("./middleware/sanitize");
const { protect } = require("./middleware/authMiddleware");
const authorize = require("./middleware/roleMiddleware");
const { writeAudit } = require("./utils/audit");
const { detectMimeFromBuffer, MIME_TO_EXT } = require("./utils/fileMagic");
const { AppError } = require("./utils/errors");
const coachRequestRoutes = require("./routes/coachRequestRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const platformRoutes = require("./routes/platformRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const biRoutes = require("./routes/biRoutes");
const storageService = require("./services/storageService");
const Tenant = require("./models/Tenant");
const { runAsPlatform } = require("./context/tenantContext");


const app = express();
app.set("trust proxy", 1);

// Support comma-separated origins in FRONTEND_ORIGIN (and strip any trailing slashes)
const configuredOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // API responses; SPA CSP is set on Vercel
    contentSecurityPolicy: false,
}));

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/+$/, "");
        if (
            configuredOrigins.includes("*") ||
            configuredOrigins.includes(cleanOrigin) ||
            /^https:\/\/leap[a-z0-9-]*\.vercel\.app$/.test(cleanOrigin) ||
            /^http:\/\/localhost(:\d+)?$/.test(cleanOrigin) ||
            /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin)
        ) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-Id",
        "x-request-id",
        "X-Tenant-Slug",
        "x-tenant-slug",
        "X-Gym-Code",
        "x-gym-code",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    exposedHeaders: ["X-Request-Id"],
    credentials: false,
    maxAge: 86400,
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
    handler: (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        const message = "Too many requests, try again later";
        res.status(429).json({
            error: {
                code: "RATE_LIMITED",
                message,
                status: 429,
                requestId: req.requestId,
                retryAfter,
            },
            code: "RATE_LIMITED",
            message,
            retryAfter,
        });
    },
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
app.use("/api/whatsapp", whatsappSessionRoutes);
app.use("/api/accounting", contractRoutes);
app.use("/api/requests", salesRequestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/coach-requests", coachRequestRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/bi", biRoutes);

const uploadReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        const message = "Too many file requests, try again later";
        res.status(429).json({
            error: {
                code: "RATE_LIMITED",
                message,
                status: 429,
                requestId: req.requestId,
                retryAfter,
            },
            code: "RATE_LIMITED",
            message,
            retryAfter,
        });
    },
});

function sendBuffer(res, buffer, mime, { filename, download, cache }) {
    const headerName = String(filename || "file").replace(/["\r\n]/g, "");
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (mime === "image/svg+xml") {
        res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    }
    if (cache) res.setHeader("Cache-Control", cache);
    if (download !== undefined) {
        res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${headerName}"`);
    }
    res.send(buffer);
}

async function sendRemoteObject(res, tenantId, filename, options = {}) {
    const obj = await storageService.readObject(tenantId, filename);
    if (!obj) return false;
    const mime = detectMimeFromBuffer(obj.buffer);
    if (!mime || !MIME_TO_EXT[mime]?.some((ext) => filename.toLowerCase().endsWith(ext))) {
        return false;
    }
    const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    if (options.allowPublicRedirect && publicBase && filename.startsWith("logo-")) {
        res.redirect(302, `${publicBase}/${tenantId}/${encodeURIComponent(filename)}`);
        return true;
    }
    sendBuffer(res, obj.buffer, mime, {
        ...options,
        download: mime === "application/pdf",
    });
    return true;
}

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
    async (req, res, next) => {
        const safe = path.basename(req.params.filename);
        if (safe !== req.params.filename || safe.includes("..")) {
            return res.status(400).json({ message: "Invalid filename" });
        }

        // Publicly serve tenant logos (workspace branding rendered by browser <img> tags without bearer token)
        if (safe.startsWith("logo-")) {
            try {
                const tenant = await runAsPlatform(() =>
                    Tenant.findOne({ "settings.branding.logoKey": safe }).select("_id")
                );
                if (!tenant) return res.status(404).json({ message: "File not found" });
                const sent = await sendRemoteObject(res, tenant._id, safe, {
                    filename: safe,
                    cache: "public, max-age=86400",
                    allowPublicRedirect: true,
                });
                if (!sent) return res.status(404).json({ message: "File not found" });
                return;
            } catch (err) {
                return next(err);
            }
        }

        next();
    },
    protect,
    authorize("Receptionist", "Owner", "General Manager", "Sales", "Sales Manager", "Coach", "Coach Manager", "Accountant"),
    async (req, res) => {
        const safe = path.basename(req.params.filename);
        if (safe !== req.params.filename || safe.includes("..")) {
            return res.status(400).json({ message: "Invalid filename" });
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

        try {
            const sent = await sendRemoteObject(res, member.tenantId, safe, {
                filename: safe,
            });
            if (!sent) {
                if (uploadType === "profile_photo" && member.photo === safe) {
                    try {
                        await Member.updateOne({ _id: member._id }, { $set: { photo: null } });
                    } catch (_) {}
                }
                return res.status(404).json({ message: "File not found" });
            }
        } catch (err) {
            return res.status(500).json({ message: "Unable to read stored file" });
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
    }
);

// 404 handler returning standard error envelope
app.use((req, res, next) => {
    next(new AppError("ROUTE_NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found`, 404));
});

app.use(errorHandler);

module.exports = app;
