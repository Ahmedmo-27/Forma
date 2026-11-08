const multer  = require("multer");
const path    = require("path");
const crypto  = require("crypto");
const {
    prepareUpload,
    assertSafeFilename,
    INTAKE_MAX_BYTES,
    SPREADSHEET_MAX_BYTES,
} = require("../utils/prepareUpload");
const { getTenantContext, runWithTenant } = require("../context/tenantContext");

const DOCUMENT_EXT = new Set([".jpeg", ".jpg", ".png", ".gif", ".webp", ".pdf"]);
const PHOTO_EXT = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const LOGO_EXT = new Set([".jpeg", ".jpg", ".png", ".webp", ".svg"]);
const SHEET_EXT = new Set([".xlsx", ".xls", ".csv"]);
const NAME_EXT = new Set([...DOCUMENT_EXT, ".svg"]);

const FIELD_PREFIX = {
    photoFile: "photo-",
    photo: "photo-",
    nationalIdFile: "nid-",
    nationalId: "nid-",
    idFile: "inv-",
    logoFile: "logo-",
    logo: "logo-",
    file: "logo-",
};

function clientExtension(file) {
    return path.extname(path.basename(String(file?.originalname || "").replace(/\\/g, "/"))).toLowerCase();
}

function makeFilename(file, prefix = "") {
    const ext = clientExtension(file);
    const safeExt = NAME_EXT.has(ext) ? ext : "";
    const unique = crypto.randomBytes(16).toString("hex");
    return `${prefix}${unique}${safeExt}`;
}

function stampFilename(file, prefix) {
    if (!file || file.filename) return;
    const chosen = prefix || FIELD_PREFIX[file.fieldname] || "";
    file.filename = makeFilename(file, chosen);
}

function extensionFilter(allowed, message, { allowSvg = false } = {}) {
    return (_req, file, cb) => {
        try {
            assertSafeFilename(file.originalname, { allowSvg });
            if (!allowed.has(clientExtension(file))) return cb(new Error(message));
            return cb(null, true);
        } catch (err) {
            return cb(err);
        }
    };
}

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    fileFilter: extensionFilter(DOCUMENT_EXT, "Only images (jpeg, png, gif, webp) and PDF files are allowed"),
    limits: { fileSize: INTAKE_MAX_BYTES },
});

const photoUpload = multer({
    storage,
    fileFilter: extensionFilter(PHOTO_EXT, "Profile photo must be jpeg, png, or webp"),
    limits: { fileSize: INTAKE_MAX_BYTES },
});

const logoUpload = multer({
    storage,
    fileFilter: extensionFilter(LOGO_EXT, "Logo must be a png, jpeg, webp, or svg image", { allowSvg: true }),
    limits: { fileSize: INTAKE_MAX_BYTES },
});

const spreadsheetUpload = multer({
    storage,
    fileFilter: extensionFilter(SHEET_EXT, "Only .xlsx, .xls or .csv files are allowed"),
    limits: { fileSize: SPREADSHEET_MAX_BYTES },
});

function handleUploadError(err, res, { maxMb = 15 } = {}) {
    if (err?.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: `File too large. Maximum size is ${maxMb} MB.` });
    }
    const status = Number(err?.statusCode) || 400;
    return res.status(status).json({ message: err?.message || "Invalid file upload" });
}

const uploadSingle = (fieldName) => (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
        if (err) return handleUploadError(err, res);
        if (!req.file) return next();
        stampFilename(req.file);
        prepareUpload(req.file, "document").then(() => next()).catch((error) => handleUploadError(error, res));
    });
};

const uploadLogo = (req, res, next) => {
    logoUpload.fields([
        { name: "logoFile", maxCount: 1 },
        { name: "logo", maxCount: 1 },
        { name: "file", maxCount: 1 },
    ])(req, res, (err) => {
        if (err) return handleUploadError(err, res);
        const files = req.files || {};
        for (const group of Object.values(files)) {
            (group || []).forEach((file) => stampFilename(file, "logo-"));
        }
        req.file = req.files?.logoFile?.[0] || req.files?.logo?.[0] || req.files?.file?.[0] || null;
        if (!req.file) return next();
        prepareUpload(req.file, "logo").then(() => next()).catch((error) => handleUploadError(error, res));
    });
};

const uploadSinglePhoto = (fieldName) => (req, res, next) => {
    if (fieldName === "logoFile" || fieldName === "logo") {
        return uploadLogo(req, res, next);
    }
    photoUpload.single(fieldName)(req, res, (err) => {
        if (err) return handleUploadError(err, res);
        if (!req.file) return next();
        stampFilename(req.file);
        prepareUpload(req.file, "photo").then(() => next()).catch((error) => handleUploadError(error, res));
    });
};

const uploadSpreadsheet = (req, res, next) => {
    // Multer finishes large files on a later tick, after the request has left
    // the tenant context. Capture it now and restore it before the controller runs.
    const tenant = getTenantContext();
    spreadsheetUpload.single("file")(req, res, (err) => {
        const proceed = () => {
            if (err) return handleUploadError(err, res, { maxMb: 5 });
            if (!req.file) return next();
            prepareUpload(req.file, "spreadsheet").then(() => next()).catch((error) => handleUploadError(error, res, { maxMb: 5 }));
        };
        if (tenant?.tenantId) return runWithTenant(tenant, proceed);
        return proceed();
    });
};

module.exports = {
    upload,
    photoUpload,
    uploadSingle,
    uploadSinglePhoto,
    uploadLogo,
    uploadSpreadsheet,
    handleUploadError,
};
