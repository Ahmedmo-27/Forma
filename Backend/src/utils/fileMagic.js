const fs = require("fs");

const ALLOWED = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
]);

const IMAGE_ONLY = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const MIME_TO_EXT = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    "image/svg+xml": [".svg"],
    "application/pdf": [".pdf"],
};

const LOGO_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
]);

/**
 * Detect MIME from magic bytes — do not trust client Content-Type or extension alone.
 */
function detectMimeFromBuffer(buf) {
    if (!buf || buf.length < 4) return null;

    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
    if (
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf.length >= 12 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
        return "image/webp";
    }
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
        return "application/pdf";
    }
    if (looksLikeSvg(buf)) return "image/svg+xml";
    return null;
}

function looksLikeSvg(buf) {
    const sample = buf.slice(0, Math.min(buf.length, 512)).toString("utf8").replace(/^\uFEFF/, "").trim().toLowerCase();
    return sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg"));
}

function assertSafeSvg(buf) {
    const text = buf.toString("utf8");
    if (!looksLikeSvg(buf)) {
        const err = new Error("Logo must be a png, jpeg, webp, or svg image");
        err.statusCode = 400;
        throw err;
    }
    const withoutNamespaces = text.replace(
        /xmlns(?::[a-z0-9]+)?\s*=\s*["']https?:\/\/www\.w3\.org\/[^"']*["']/gi,
        ""
    );
    if (/<script|javascript:|data:\s*text\/html|\son[a-z]+\s*=|<\s*foreignobject|<\s*iframe|<\s*embed|<\s*object|<!doctype|<!entity|https?:\/\/|href\s*=\s*["']\s*\/\//i.test(withoutNamespaces)) {
        const err = new Error("SVG logos cannot contain scripts, event handlers, or external content");
        err.statusCode = 400;
        throw err;
    }
    return "image/svg+xml";
}

async function readUploadBuffer(fileOrPath) {
    if (fileOrPath && typeof fileOrPath === "object") {
        if (Buffer.isBuffer(fileOrPath.buffer)) return fileOrPath.buffer;
        if (fileOrPath.path) return fs.promises.readFile(fileOrPath.path);
        const err = new Error("Upload is missing file data");
        err.statusCode = 400;
        throw err;
    }
    return fs.promises.readFile(fileOrPath);
}

async function assertAllowedUpload(fileOrPath) {
    if (fileOrPath && typeof fileOrPath === "object") {
        if (Buffer.isBuffer(fileOrPath.buffer)) {
            const mime = detectMimeFromBuffer(fileOrPath.buffer);
            if (!mime || !ALLOWED.has(mime)) {
                const err = new Error("File content does not match allowed types (jpeg, png, gif, webp, pdf)");
                err.statusCode = 400;
                throw err;
            }
            return mime;
        }
        if (fileOrPath.path) return assertAllowedUpload(fileOrPath.path);
        const err = new Error("Upload is missing file data");
        err.statusCode = 400;
        throw err;
    }

    const fd = await fs.promises.open(fileOrPath, "r");
    try {
        const buf = Buffer.alloc(512);
        const { bytesRead } = await fd.read(buf, 0, 512, 0);
        const mime = detectMimeFromBuffer(buf.subarray(0, bytesRead));
        if (!mime || !ALLOWED.has(mime)) {
            const err = new Error("File content does not match allowed types (jpeg, png, gif, webp, pdf)");
            err.statusCode = 400;
            throw err;
        }
        return mime;
    } finally {
        await fd.close();
    }
}

/** Profile photos: jpeg/png/webp only (no GIF/PDF). */
async function assertAllowedImage(filePath) {
    const mime = await assertAllowedUpload(filePath);
    if (!IMAGE_ONLY.has(mime)) {
        const err = new Error("Profile photo must be an image (jpeg, png, webp)");
        err.statusCode = 400;
        throw err;
    }
    return mime;
}

/** Gym logos: png, jpeg, webp, or a script-free svg. */
async function assertAllowedLogo(fileOrPath) {
    const buf = await readUploadBuffer(fileOrPath);
    const mime = detectMimeFromBuffer(buf);
    if (mime === "image/svg+xml") return assertSafeSvg(buf);
    if (mime && LOGO_TYPES.has(mime)) return mime;
    const err = new Error("Logo must be a png, jpeg, webp, or svg image");
    err.statusCode = 400;
    throw err;
}

async function detectMimeFromFile(filePath) {
    const fd = await fs.promises.open(filePath, "r");
    try {
        const buf = Buffer.alloc(512);
        const { bytesRead } = await fd.read(buf, 0, 512, 0);
        return detectMimeFromBuffer(buf.subarray(0, bytesRead));
    } finally {
        await fd.close();
    }
}

module.exports = {
    detectMimeFromBuffer,
    detectMimeFromFile,
    assertAllowedUpload,
    assertAllowedImage,
    assertAllowedLogo,
    assertSafeSvg,
    ALLOWED,
    IMAGE_ONLY,
    LOGO_TYPES,
    MIME_TO_EXT,
};
