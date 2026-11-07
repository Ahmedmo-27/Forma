const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const sharp = require("sharp");
const {
    PDFArray,
    PDFDocument,
    PDFName,
    PDFNumber,
    PDFRawStream,
} = require("pdf-lib");
const {
    detectMimeFromBuffer,
    assertSafeSvg,
    MIME_TO_EXT,
    IMAGE_ONLY,
    LOGO_TYPES,
    ALLOWED,
} = require("./fileMagic");

const MB = 1024 * 1024;

const INTAKE_MAX_BYTES = 15 * MB;
const PHOTO_MAX_BYTES = 2 * MB;
const DOCUMENT_MAX_BYTES = 5 * MB;
const SPREADSHEET_MAX_BYTES = 5 * MB;
const MAX_PDF_PAGES = 40;
const MAX_IMAGE_PIXELS = 40_000_000;

const CODE_EXTENSIONS = new Set([
    "js", "mjs", "cjs", "jsx", "ts", "tsx",
    "php", "phtml", "phar", "php3", "php4", "php5", "pht",
    "html", "htm", "xhtml", "svg", "xml",
    "exe", "dll", "so", "bat", "cmd", "ps1", "sh", "bash",
    "py", "rb", "pl", "cgi", "asp", "aspx", "jsp", "jar", "wasm",
    "vbs", "wsf", "hta", "scr", "com", "msi",
]);

const PROFILES = {
    photo: {
        mimes: IMAGE_ONLY,
        maxBytes: PHOTO_MAX_BYTES,
        allowSvg: false,
    },
    document: {
        mimes: ALLOWED,
        maxBytes: DOCUMENT_MAX_BYTES,
        allowSvg: false,
    },
    logo: {
        mimes: LOGO_TYPES,
        maxBytes: PHOTO_MAX_BYTES,
        allowSvg: true,
    },
    spreadsheet: {
        mimes: new Set([
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
        ]),
        maxBytes: SPREADSHEET_MAX_BYTES,
        allowSvg: false,
    },
};

const PDF_ACTIVE_KEYS = ["JavaScript", "JS", "Launch", "EmbeddedFile", "RichMedia", "OpenAction", "AA", "SubmitForm"];
const PDF_ACTIVE_TOKENS = ["/JavaScript", "/Launch", "/EmbeddedFile", "/RichMedia", "/OpenAction", "/SubmitForm"];

const IMAGE_ATTEMPTS = [
    { quality: 82, edge: null },
    { quality: 70, edge: 2560 },
    { quality: 60, edge: 2000 },
    { quality: 50, edge: 1600 },
    { quality: 40, edge: 1280 },
    { quality: 35, edge: 1024 },
    { quality: 30, edge: 800 },
];

function reject(message, statusCode = 400) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function tooLarge(maxBytes, { compressed = false } = {}) {
    const mb = Math.round(maxBytes / MB);
    const message = compressed
        ? `File is too large. Maximum size is ${mb} MB after compression.`
        : `File too large. Maximum size is ${mb} MB.`;
    return reject(message, 413);
}

function baseName(name) {
    return path.basename(String(name || "").replace(/\\/g, "/"));
}

function finalExtension(name) {
    return path.extname(baseName(name)).toLowerCase();
}

function assertSafeFilename(name, { allowSvg = false } = {}) {
    const base = baseName(name);
    if (!base || base.includes("\0")) {
        throw reject("Invalid file name");
    }
    const parts = base.toLowerCase().split(".");
    if (parts.length < 2 || !parts[0]) {
        throw reject("This file type is not allowed");
    }
    const extensions = parts.slice(1);
    const finalExt = extensions[extensions.length - 1];
    for (const ext of extensions) {
        if (!CODE_EXTENSIONS.has(ext)) continue;
        if (ext === "svg" && allowSvg && finalExt === "svg") continue;
        throw reject("This file type is not allowed");
    }
}

function assertUploadNames(file, profile) {
    const names = [file?.originalname, file?.filename].filter(Boolean);
    if (!names.length) throw reject("Upload is missing a filename");
    for (const name of names) {
        assertSafeFilename(name, profile);
    }
}

function assertExtensionMatches(name, mime) {
    const ext = finalExtension(name);
    const allowed = MIME_TO_EXT[mime] || [];
    if (!allowed.includes(ext)) {
        throw reject("File extension does not match its contents");
    }
}

function replaceExtension(name, ext) {
    const normalized = String(name || "").replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : "";
    const file = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    const dot = file.lastIndexOf(".");
    const stem = dot > 0 ? file.slice(0, dot) : file;
    return `${dir}${stem}${ext}`;
}

function applyOutputName(file, mime) {
    const ext = (MIME_TO_EXT[mime] || [])[0];
    if (!ext) return;
    if (file.filename) file.filename = replaceExtension(file.filename, ext);
    if (file.originalname) file.originalname = replaceExtension(file.originalname, ext);
}

async function readBuffer(file) {
    if (Buffer.isBuffer(file)) return file;
    if (file && Buffer.isBuffer(file.buffer)) return file.buffer;
    if (file?.path) return fs.promises.readFile(file.path);
    throw reject("Upload is missing file data");
}

function profileForUpload(file) {
    if (file?.preparedProfile && PROFILES[file.preparedProfile]) return file.preparedProfile;
    const name = baseName(file?.filename || file?.originalname || "");
    if (name.startsWith("logo-")) return "logo";
    if (name.startsWith("photo-")) return "photo";
    if (name.startsWith("nid-") || name.startsWith("inv-")) return "document";
    return null;
}

function listZipNames(buf) {
    const names = [];
    const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    let offset = 0;
    while (offset + 46 <= buf.length) {
        const idx = buf.indexOf(signature, offset);
        if (idx < 0 || idx + 46 > buf.length) break;
        const nameLen = buf.readUInt16LE(idx + 28);
        const extraLen = buf.readUInt16LE(idx + 30);
        const commentLen = buf.readUInt16LE(idx + 32);
        const nameEnd = idx + 46 + nameLen;
        if (nameEnd > buf.length) break;
        const name = buf.subarray(idx + 46, nameEnd).toString("utf8").replace(/\\/g, "/");
        if (name.includes("\0") || name.split("/").includes("..")) {
            throw reject("File content is not a valid spreadsheet");
        }
        names.push(name);
        const next = nameEnd + extraLen + commentLen;
        if (next <= idx) break;
        offset = next;
    }
    return names;
}

function assertXlsx(buf) {
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || (buf[2] !== 0x03 && buf[2] !== 0x05)) {
        throw reject("File content is not a valid spreadsheet");
    }
    const names = listZipNames(buf).map((name) => name.toLowerCase());
    if (names.some((name) => name.endsWith("vbaproject.bin"))) {
        throw reject("Spreadsheets cannot contain macros");
    }
    const hasTypes = names.some((name) => name === "[content_types].xml" || name.endsWith("/[content_types].xml"));
    const hasWorkbook = names.some((name) => name.endsWith("xl/workbook.xml") || name.endsWith("xl/workbook.bin"));
    if (!hasTypes || !hasWorkbook) {
        throw reject("File content is not a valid spreadsheet");
    }
    let workbook;
    try {
        const XLSX = require("xlsx");
        workbook = XLSX.read(buf, { type: "buffer", bookVBA: false, cellFormula: false });
    } catch {
        throw reject("File content is not a valid spreadsheet");
    }
    if (!workbook?.SheetNames?.length) {
        throw reject("File content is not a valid spreadsheet");
    }
}

function assertXls(buf) {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (buf.length < ole.length || !buf.subarray(0, ole.length).equals(ole)) {
        throw reject("File content is not a valid spreadsheet");
    }
    const marker = Buffer.from("_VBA_PROJECT_CUR");
    if (buf.includes(marker) || buf.includes(Buffer.from("_VBA_PROJECT_CUR", "utf16le"))) {
        throw reject("Spreadsheets cannot contain macros");
    }
    let workbook;
    try {
        const XLSX = require("xlsx");
        workbook = XLSX.read(buf, { type: "buffer", bookVBA: false, cellFormula: false });
    } catch {
        throw reject("File content is not a valid spreadsheet");
    }
    if (!workbook?.SheetNames?.length) {
        throw reject("File content is not a valid spreadsheet");
    }
}

function assertCsv(buf) {
    if (!buf.length || buf.includes(0)) {
        throw reject("File content is not a valid spreadsheet");
    }
    const text = buf.toString("utf8").replace(/^\uFEFF/, "").trimStart().slice(0, 512).toLowerCase();
    if (/^(<\?php|<\?xml|#!|<\s*script|<\s*html|<\s*svg|javascript:)/.test(text)) {
        throw reject("File content is not a valid spreadsheet");
    }
}

function prepareSpreadsheet(file, buffer) {
    const ext = finalExtension(file.originalname || file.filename || "");
    if (ext === ".xlsx") {
        assertXlsx(buffer);
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (ext === ".xls") {
        assertXls(buffer);
        return "application/vnd.ms-excel";
    }
    if (ext === ".csv") {
        assertCsv(buffer);
        return "text/csv";
    }
    throw reject("Only .xlsx, .xls or .csv files are allowed");
}

function sharpOptions() {
    return { failOn: "error", animated: false, limitInputPixels: MAX_IMAGE_PIXELS };
}

async function encodeImage(input, mime, { quality, edge }) {
    let pipeline = sharp(input, sharpOptions());
    if (edge) {
        pipeline = pipeline.resize({
            width: edge,
            height: edge,
            fit: "inside",
            withoutEnlargement: true,
        });
    }
    if (mime === "image/jpeg") return pipeline.jpeg({ quality }).toBuffer();
    if (mime === "image/png") {
        return pipeline.png({ compressionLevel: 9, palette: quality <= 50 }).toBuffer();
    }
    if (mime === "image/webp") return pipeline.webp({ quality }).toBuffer();
    if (mime === "image/gif") return pipeline.gif().toBuffer();
    throw reject("File content does not match an allowed image type");
}

async function reencodeImage(buffer, mime, maxBytes) {
    try {
        await sharp(buffer, sharpOptions()).metadata();
    } catch {
        throw reject("File content does not match an allowed image type");
    }

    let last = null;
    for (const attempt of IMAGE_ATTEMPTS) {
        try {
            last = await encodeImage(buffer, mime, attempt);
        } catch {
            throw reject("File content does not match an allowed image type");
        }
        if (detectMimeFromBuffer(last) !== mime) {
            throw reject("File content does not match an allowed image type");
        }
        if (last.length <= maxBytes) return last;
    }
    throw tooLarge(maxBytes, { compressed: true });
}

function pdfHasActiveTokens(buffer) {
    const latin = buffer.toString("latin1");
    return PDF_ACTIVE_TOKENS.some((token) => latin.includes(token));
}

function dictHasActiveContent(dict) {
    if (!dict || typeof dict.has !== "function" || typeof dict.lookup !== "function") return false;
    for (const key of PDF_ACTIVE_KEYS) {
        if (dict.has(PDFName.of(key))) return true;
    }
    const action = dict.lookup(PDFName.of("S"));
    return Boolean(action && action.toString() === "/JavaScript");
}

function pdfHasActiveObjects(pdfDoc) {
    if (dictHasActiveContent(pdfDoc.catalog)) return true;
    for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
        const dict = obj?.dict || obj;
        if (dictHasActiveContent(dict)) return true;
    }
    return false;
}

async function loadPdf(buffer) {
    const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
    if (!head.includes("%PDF-")) {
        throw reject("File content is not a valid PDF");
    }
    if (pdfHasActiveTokens(buffer)) {
        throw reject("PDF files cannot contain scripts or embedded actions");
    }
    try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false });
        if (pdfHasActiveObjects(doc)) {
            throw reject("PDF files cannot contain scripts or embedded actions");
        }
        const pages = doc.getPageCount();
        if (pages < 1 || pages > MAX_PDF_PAGES) {
            throw reject("File content is not a valid PDF");
        }
        return doc;
    } catch (err) {
        if (err.statusCode) throw err;
        throw reject("File content is not a valid PDF");
    }
}

function filtersOf(dict) {
    const filter = dict.lookup(PDFName.of("Filter"));
    if (!filter) return [];
    if (filter instanceof PDFArray) {
        const names = [];
        for (let i = 0; i < filter.size(); i += 1) {
            const item = filter.lookup(i);
            if (item) names.push(item.toString());
        }
        return names;
    }
    return [filter.toString()];
}

function numberValue(dict, key) {
    const value = dict.lookup(PDFName.of(key));
    return value && typeof value.asNumber === "function" ? value.asNumber() : null;
}

function predictorOf(dict) {
    const parms = dict.lookup(PDFName.of("DecodeParms"));
    if (!parms || typeof parms.lookup !== "function") return 1;
    const predictor = parms.lookup(PDFName.of("Predictor"));
    return predictor && typeof predictor.asNumber === "function" ? predictor.asNumber() : 1;
}

async function jpegFromRawImage(dict, stream, quality, maxEdge) {
    const width = numberValue(dict, "Width");
    const height = numberValue(dict, "Height");
    const bits = numberValue(dict, "BitsPerComponent");
    const colorSpace = dict.lookup(PDFName.of("ColorSpace"));
    const colorName = colorSpace ? colorSpace.toString() : "";
    const channels = colorName === "/DeviceRGB" ? 3 : colorName === "/DeviceGray" ? 1 : 0;
    if (!width || !height || bits !== 8 || !channels) return null;
    if (predictorOf(dict) > 1) return null;
    const expected = width * height * channels;
    if (expected <= 0 || expected > MAX_IMAGE_PIXELS * channels) return null;
    let raw;
    try {
        raw = zlib.inflateSync(Buffer.from(stream.getContents()));
    } catch {
        return null;
    }
    if (raw.length < expected) return null;
    let pipeline = sharp(raw.subarray(0, expected), {
        raw: { width, height, channels },
        ...sharpOptions(),
    });
    if (maxEdge) {
        pipeline = pipeline.resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true,
        });
    }
    return pipeline.jpeg({ quality }).toBuffer();
}

function writeJpegImage(dict, stream, jpeg, meta) {
    stream.contents = jpeg;
    dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    dict.set(PDFName.of("Length"), PDFNumber.of(jpeg.length));
    dict.set(PDFName.of("Width"), PDFNumber.of(meta.width));
    dict.set(PDFName.of("Height"), PDFNumber.of(meta.height));
    dict.set(PDFName.of("ColorSpace"), PDFName.of(meta.channels === 1 ? "DeviceGray" : "DeviceRGB"));
    dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
    if (typeof dict.delete === "function") dict.delete(PDFName.of("DecodeParms"));
}

async function recompressPdfImages(pdfDoc, { quality, maxEdge }) {
    for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.lookup(PDFName.of("Subtype"));
        if (!subtype || subtype.toString() !== "/Image") continue;
        const masked = dict.has(PDFName.of("SMask")) || dict.has(PDFName.of("Mask"));
        if (masked && maxEdge) continue;

        const filters = filtersOf(dict);
        try {
            let jpeg = null;
            if (filters.length === 1 && filters[0] === "/DCTDecode") {
                let pipeline = sharp(Buffer.from(obj.getContents()), sharpOptions());
                if (maxEdge) {
                    pipeline = pipeline.resize({
                        width: maxEdge,
                        height: maxEdge,
                        fit: "inside",
                        withoutEnlargement: true,
                    });
                }
                jpeg = await pipeline.jpeg({ quality }).toBuffer();
                if (!maxEdge && jpeg.length >= obj.getContents().length) continue;
            } else if (filters.length === 1 && filters[0] === "/FlateDecode" && !masked) {
                jpeg = await jpegFromRawImage(dict, obj, quality, maxEdge);
                if (!jpeg) continue;
            } else {
                continue;
            }
            const meta = await sharp(jpeg).metadata();
            if (!meta.width || !meta.height) continue;
            writeJpegImage(dict, obj, jpeg, meta);
        } catch {
            // Leave this image unchanged when it cannot be decoded safely.
        }
    }
}

async function sanitizePdf(buffer, maxBytes) {
    const src = await loadPdf(buffer);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((page) => out.addPage(page));
    if (pdfHasActiveObjects(out)) {
        throw reject("PDF files cannot contain scripts or embedded actions");
    }

    let bytes = Buffer.from(await out.save({ useObjectStreams: true }));
    if (bytes.length <= maxBytes) return bytes;

    await recompressPdfImages(out, { quality: 65, maxEdge: null });
    bytes = Buffer.from(await out.save({ useObjectStreams: true }));
    if (bytes.length <= maxBytes) return bytes;

    await recompressPdfImages(out, { quality: 45, maxEdge: 1600 });
    bytes = Buffer.from(await out.save({ useObjectStreams: true }));
    if (bytes.length <= maxBytes) return bytes;

    throw tooLarge(maxBytes, { compressed: true });
}

async function assertPreparedContents(file, profileName, buffer) {
    const profile = PROFILES[profileName];
    if (profileName === "spreadsheet") {
        const mime = prepareSpreadsheet(file, buffer);
        if (!profile.mimes.has(mime)) throw reject("File content is not a valid spreadsheet");
        return mime;
    }
    const mime = detectMimeFromBuffer(buffer);
    if (!mime || !profile.mimes.has(mime)) {
        throw reject("File content does not match an allowed type");
    }
    const names = [file.filename, file.originalname].filter(Boolean);
    for (const name of names) assertExtensionMatches(name, mime);
    if (mime === "image/svg+xml") {
        assertSafeSvg(buffer);
        return mime;
    }
    if (mime === "application/pdf") {
        await loadPdf(buffer);
        return mime;
    }
    try {
        await sharp(buffer, sharpOptions()).metadata();
    } catch {
        throw reject("File content does not match an allowed image type");
    }
    return mime;
}

function assignPrepared(file, buffer, mime, profileName) {
    file.buffer = buffer;
    file.size = buffer.length;
    file.mimetype = mime;
    if (profileName !== "spreadsheet") applyOutputName(file, mime);
    file.preparedProfile = profileName;
    return mime;
}

/**
 * Validate one upload and, when it is a real image or PDF over the stored limit, compress it.
 * Code, disguised files, and files that still do not fit are rejected.
 */
async function prepareUpload(file, profileName) {
    const profile = PROFILES[profileName];
    if (!profile) throw reject("Upload type is not allowed");

    assertUploadNames(file, profile);
    const buffer = await readBuffer(file);
    if (!buffer.length) throw reject("Upload is missing file data");
    if (buffer.length > INTAKE_MAX_BYTES) throw tooLarge(INTAKE_MAX_BYTES);
    if (profileName === "spreadsheet" && buffer.length > profile.maxBytes) {
        throw tooLarge(profile.maxBytes);
    }

    if (file.preparedProfile === profileName && buffer.length <= profile.maxBytes) {
        const mime = await assertPreparedContents(file, profileName, buffer);
        file.mimetype = mime;
        return mime;
    }

    if (profileName === "spreadsheet") {
        const mime = prepareSpreadsheet(file, buffer);
        return assignPrepared(file, buffer, mime, profileName);
    }

    const mime = detectMimeFromBuffer(buffer);
    if (!mime || !profile.mimes.has(mime)) {
        throw reject("File content does not match an allowed type");
    }
    assertExtensionMatches(file.originalname || file.filename, mime);

    let output = buffer;
    if (mime === "image/svg+xml") {
        assertSafeSvg(buffer);
        if (buffer.length > profile.maxBytes) throw tooLarge(profile.maxBytes, { compressed: true });
    } else if (mime === "application/pdf") {
        output = await sanitizePdf(buffer, profile.maxBytes);
    } else {
        output = await reencodeImage(buffer, mime, profile.maxBytes);
    }

    if (output.length > profile.maxBytes) throw tooLarge(profile.maxBytes, { compressed: true });
    return assignPrepared(file, output, mime, profileName);
}

module.exports = {
    prepareUpload,
    profileForUpload,
    assertSafeFilename,
    INTAKE_MAX_BYTES,
    PHOTO_MAX_BYTES,
    DOCUMENT_MAX_BYTES,
    SPREADSHEET_MAX_BYTES,
    PROFILES,
};
