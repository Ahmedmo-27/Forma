const multer  = require("multer");
const path    = require("path");
const crypto  = require("crypto");

const ALLOWED_EXT = new Set([".jpeg", ".jpg", ".png", ".gif", ".webp", ".pdf"]);
const ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
]);

/** Profile photos: images only, no GIF/PDF, tighter size. */
const PHOTO_EXT = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const PHOTO_MIME = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
]);

const FIELD_PREFIX = {
    photoFile: "photo-",
    photo: "photo-",
    nationalIdFile: "nid-",
    nationalId: "nid-",
    idFile: "inv-",
    logoFile: "logo-",
    logo: "logo-",
    file: "photo-",
};

function makeFilename(file, prefix = "") {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : "";
    const unique = crypto.randomBytes(16).toString("hex");
    return `${prefix}${unique}${safeExt}`;
}

function stampFilename(file) {
    if (!file || file.filename) return;
    const prefix = FIELD_PREFIX[file.fieldname] || "";
    file.filename = makeFilename(file, prefix);
}

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.has(ext) && ALLOWED_MIME.has(file.mimetype)) {
        return cb(null, true);
    }
    cb(new Error("Only images (jpeg, png, gif, webp) and PDF files are allowed"));
};

const photoFileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (PHOTO_EXT.has(ext) && PHOTO_MIME.has(file.mimetype)) {
        return cb(null, true);
    }
    cb(new Error("Profile photo must be jpeg, png, or webp"));
};

const LOGO_EXT = new Set([".jpeg", ".jpg", ".png", ".webp", ".svg"]);

const logoFileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "").toLowerCase();
    if (LOGO_EXT.has(ext) || mime.startsWith("image/") || mime === "text/xml" || mime === "application/xml") {
        return cb(null, true);
    }
    cb(new Error("Logo must be a png, jpeg, webp, or svg image"));
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB max (national ID / invitations)
});

const photoUpload = multer({
    storage,
    fileFilter: photoFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2 MB max for profile photos
});

const logoUpload = multer({
    storage,
    fileFilter: logoFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }
});

function handleUploadError(err, res) {
    if (err.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File too large. Maximum size is 5 MB." });
    }
    return res.status(400).json({ message: err.message });
}

const uploadSingle = (fieldName) => (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
        if (err) return handleUploadError(err, res);
        stampFilename(req.file);
        next();
    });
};

const uploadLogo = (req, res, next) => {
    logoUpload.fields([
        { name: "logoFile", maxCount: 1 },
        { name: "logo", maxCount: 1 },
        { name: "file", maxCount: 1 }
    ])(req, res, (err) => {
        if (err) return handleUploadError(err, res);
        const files = req.files || {};
        for (const group of Object.values(files)) {
            (group || []).forEach(stampFilename);
        }
        req.file = req.files?.logoFile?.[0] || req.files?.logo?.[0] || req.files?.file?.[0] || null;
        next();
    });
};

const uploadSinglePhoto = (fieldName) => (req, res, next) => {
    if (fieldName === "logoFile" || fieldName === "logo") {
        return uploadLogo(req, res, next);
    }
    photoUpload.single(fieldName)(req, res, (err) => {
        if (err) return handleUploadError(err, res);
        stampFilename(req.file);
        next();
    });
};

module.exports = {
    upload,
    photoUpload,
    uploadSingle,
    uploadSinglePhoto,
    uploadLogo,
    handleUploadError,
};
