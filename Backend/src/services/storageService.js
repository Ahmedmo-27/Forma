const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const { detectMimeFromBuffer } = require("../utils/fileMagic");

const BASE_UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.cwd(), process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../uploads");

let s3Client = null;

function loadS3() {
    const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    return { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command, getSignedUrl };
}

class StorageService {
    constructor(baseDir = BASE_UPLOADS_DIR) {
        this.baseDir = baseDir;
        this.driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();

        if (!this.isRemote() && !fs.existsSync(this.baseDir)) {
            try {
                fs.mkdirSync(this.baseDir, { recursive: true });
            } catch (_) {}
        }
    }

    isRemote() {
        return this.driver === "r2" || this.driver === "s3";
    }

    getDriverName() {
        return this.driver;
    }

    bucketName() {
        return process.env.R2_BUCKET_NAME || process.env.AWS_S3_BUCKET || "";
    }

    getClient() {
        if (!s3Client) {
            const { S3Client } = loadS3();
            const accountId = process.env.R2_ACCOUNT_ID;
            const endpoint = process.env.AWS_S3_ENDPOINT
                || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
            s3Client = new S3Client({
                region: process.env.AWS_REGION || "auto",
                endpoint,
                credentials: {
                    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
                    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
                },
            });
        }
        return s3Client;
    }

    objectKey(tenantId, filename) {
        const safe = path.basename(filename);
        if (!tenantId || safe !== filename || safe.includes("..")) {
            throw new Error("StorageService: invalid object key");
        }
        return `${tenantId}/${safe}`;
    }

    getTenantDir(tenantId) {
        if (!tenantId) {
            throw new Error("StorageService: tenantId is required to resolve tenant storage directory");
        }
        const tenantDir = path.join(this.baseDir, String(tenantId));
        if (!this.isRemote() && !fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }
        return tenantDir;
    }

    resolvePath(tenantId, filename) {
        const safeFilename = path.basename(filename);
        const tenantDir = this.getTenantDir(tenantId);
        const fullPath = path.resolve(tenantDir, safeFilename);

        if (!fullPath.startsWith(tenantDir)) {
            throw new Error("StorageService: Access denied — path traversal attempt detected");
        }

        return fullPath;
    }

    async exists(tenantId, filename) {
        if (this.isRemote()) {
            const { HeadObjectCommand } = loadS3();
            try {
                await this.getClient().send(new HeadObjectCommand({
                    Bucket: this.bucketName(),
                    Key: this.objectKey(tenantId, filename),
                }));
                return true;
            } catch {
                return false;
            }
        }
        try {
            const result = this.findFile(filename, [tenantId]);
            return result.found;
        } catch {
            return false;
        }
    }

    findFile(filename, tenantCandidates = []) {
        if (!filename) return { found: false, filePath: null, tenantId: null };
        const safe = path.basename(filename);
        if (safe !== filename || safe.includes("..")) {
            return { found: false, filePath: null, tenantId: null };
        }

        const candidates = (Array.isArray(tenantCandidates) ? tenantCandidates : [tenantCandidates])
            .filter(Boolean)
            .map(String);

        for (const tId of candidates) {
            try {
                const tenantDir = path.join(this.baseDir, tId);
                const candidatePath = path.resolve(tenantDir, safe);
                if (candidatePath.startsWith(tenantDir) && fs.existsSync(candidatePath)) {
                    return { found: true, filePath: candidatePath, tenantId: tId };
                }
            } catch (_) {}
        }

        try {
            const rootPath = path.resolve(this.baseDir, safe);
            if (path.dirname(rootPath) === this.baseDir && fs.existsSync(rootPath)) {
                return { found: true, filePath: rootPath, tenantId: null };
            }
        } catch (_) {}

        try {
            const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const candidatePath = path.resolve(this.baseDir, entry.name, safe);
                    if (candidatePath.startsWith(path.join(this.baseDir, entry.name)) && fs.existsSync(candidatePath)) {
                        return { found: true, filePath: candidatePath, tenantId: entry.name };
                    }
                }
            }
        } catch (_) {}

        return { found: false, filePath: null, tenantId: null };
    }

    async saveFile(tenantId, filename, buffer) {
        const safe = path.basename(filename);
        if (this.isRemote()) {
            const { PutObjectCommand } = loadS3();
            const mime = detectMimeFromBuffer(buffer) || "application/octet-stream";
            await this.getClient().send(new PutObjectCommand({
                Bucket: this.bucketName(),
                Key: this.objectKey(tenantId, safe),
                Body: buffer,
                ContentType: mime,
            }));
            return `${tenantId}/${safe}`;
        }

        const filePath = this.resolvePath(tenantId, safe);
        await fsPromises.writeFile(filePath, buffer);
        return `${tenantId}/${safe}`;
    }

    /**
     * After magic-byte checks: local uploads are already on disk.
     * Remote uploads are held in memory until this writes them to the bucket.
     */
    async persistUpload(tenantId, file) {
        if (!file) return null;
        const filename = path.basename(file.filename || "");
        if (!filename) {
            throw new Error("StorageService: upload is missing a filename");
        }
        if (Buffer.isBuffer(file.buffer)) {
            await this.saveFile(tenantId, filename, file.buffer);
        } else if (this.isRemote()) {
            throw new Error("StorageService: remote upload is missing a file buffer");
        }
        return filename;
    }

    async deleteFile(tenantId, filename) {
        if (!filename) return false;
        const safe = path.basename(filename);
        let deleted = false;

        if (this.isRemote() && tenantId) {
            const { DeleteObjectCommand } = loadS3();
            try {
                await this.getClient().send(new DeleteObjectCommand({
                    Bucket: this.bucketName(),
                    Key: this.objectKey(tenantId, safe),
                }));
                return true;
            } catch {
                return false;
            }
        }

        if (tenantId) {
            try {
                const filePath = this.resolvePath(tenantId, safe);
                await fsPromises.unlink(filePath);
                deleted = true;
            } catch (_) {}
        }

        try {
            const rootPath = path.resolve(this.baseDir, safe);
            if (path.dirname(rootPath) === this.baseDir && fs.existsSync(rootPath)) {
                await fsPromises.unlink(rootPath);
                deleted = true;
            }
        } catch (_) {}

        return deleted;
    }

    async readObject(tenantId, filename) {
        if (!this.isRemote()) return null;
        const { GetObjectCommand } = loadS3();
        try {
            const out = await this.getClient().send(new GetObjectCommand({
                Bucket: this.bucketName(),
                Key: this.objectKey(tenantId, filename),
            }));
            const buffer = Buffer.from(await out.Body.transformToByteArray());
            return { buffer, contentType: out.ContentType || null };
        } catch (err) {
            const status = err?.$metadata?.httpStatusCode;
            if (err?.name === "NoSuchKey" || err?.name === "NotFound" || status === 404) return null;
            throw err;
        }
    }

    async getSignedUrl(tenantId, filename, expiresInSeconds = 3600) {
        const safe = path.basename(filename);
        if (!this.isRemote()) {
            return `/uploads/${encodeURIComponent(safe)}`;
        }

        const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
        if (publicBase && String(safe).startsWith("logo-")) {
            return `${publicBase}/${tenantId}/${encodeURIComponent(safe)}`;
        }

        const { GetObjectCommand, getSignedUrl } = loadS3();
        return getSignedUrl(
            this.getClient(),
            new GetObjectCommand({
                Bucket: this.bucketName(),
                Key: this.objectKey(tenantId, safe),
            }),
            { expiresIn: expiresInSeconds }
        );
    }

    async sumTenantBytes(tenantId) {
        if (!tenantId) return 0;
        if (this.isRemote()) {
            const { ListObjectsV2Command } = loadS3();
            let total = 0;
            let continuationToken;
            do {
                const out = await this.getClient().send(new ListObjectsV2Command({
                    Bucket: this.bucketName(),
                    Prefix: `${tenantId}/`,
                    ContinuationToken: continuationToken,
                }));
                for (const item of out.Contents || []) {
                    total += item.Size || 0;
                }
                continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
            } while (continuationToken);
            return total;
        }

        const tenantDir = path.join(this.baseDir, String(tenantId));
        if (!fs.existsSync(tenantDir)) return 0;
        let total = 0;
        const files = fs.readdirSync(tenantDir);
        for (const file of files) {
            const stats = fs.statSync(path.join(tenantDir, file));
            if (stats.isFile()) total += stats.size;
        }
        return total;
    }

    async deleteTenantStorage(tenantId) {
        if (!tenantId) return;
        if (this.isRemote()) {
            const { ListObjectsV2Command, DeleteObjectCommand } = loadS3();
            let continuationToken;
            do {
                const out = await this.getClient().send(new ListObjectsV2Command({
                    Bucket: this.bucketName(),
                    Prefix: `${tenantId}/`,
                    ContinuationToken: continuationToken,
                }));
                for (const item of out.Contents || []) {
                    await this.getClient().send(new DeleteObjectCommand({
                        Bucket: this.bucketName(),
                        Key: item.Key,
                    }));
                }
                continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
            } while (continuationToken);
            return;
        }

        const tenantDir = this.getTenantDir(tenantId);
        if (fs.existsSync(tenantDir)) {
            fs.rmSync(tenantDir, { recursive: true, force: true });
        }
    }
}

module.exports = new StorageService();
module.exports.StorageService = StorageService;
