const multer = require("multer");
const { AppError } = require("../utils/errors");
const { getTenantContext, runWithTenant } = require("../context/tenantContext");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
});

function uploadWhatsAppImage(req, res, next) {
    // Multer finishes the file on a later tick, after the request has left
    // the tenant context. Capture it now and restore it before the controller runs.
    const tenant = getTenantContext();
    upload.single("image")(req, res, (err) => {
        const proceed = () => {
            if (err?.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
                return next(new AppError(
                    "UPLOAD_FILE_TOO_LARGE",
                    "File too large. Maximum size is 2 MB."
                ));
            }
            if (err) return next(err);
            next();
        };
        if (tenant?.tenantId) return runWithTenant(tenant, proceed);
        return proceed();
    });
}

module.exports = { uploadWhatsAppImage };
