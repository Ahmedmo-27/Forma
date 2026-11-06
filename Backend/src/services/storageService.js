const path = require("path");
const { detectMimeFromBuffer } = require("../utils/fileMagic");

let s3Client = null;

function loadS3() {
    const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    return { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command, getSignedUrl };
}

class StorageService {
    constructor() {
        this.driver = "r2";
    }

    isRemote() {
        return true;
    }

    getDriverName() {
        return this.driver;
    }

    bucketName() {
        return process.env.R2_BUCKET_NAME || "";
    }

    /**
     * R2 rejects the CRC32 headers that AWS SDK v3.729+ sends by default.
     * Checksums are sent only when an operation requires them.
     * The endpoint is the account host; the bucket name is not part of the URL.
     */
    buildClientOptions() {
        const accountId = process.env.R2_ACCOUNT_ID;
        return {
            region: "auto",
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
            },
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        };
    }

    assertConfigured() {
        const missing = [];
        if (!process.env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
        if (!process.env.R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");
        if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
        if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
        if (missing.length) {
            throw new Error(`StorageService: Cloudflare R2 requires ${missing.join(", ")}`);
        }
    }

    getClient() {
        if (!s3Client) {
            const { S3Client } = loadS3();
            s3Client = new S3Client(this.buildClientOptions());
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

    async exists(tenantId, filename) {
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

    async saveFile(tenantId, filename, buffer) {
        const safe = path.basename(filename);
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

    /**
     * Magic-byte checks run first. The upload is held in memory until this writes it to R2.
     */
    async persistUpload(tenantId, file) {
        if (!file) return null;
        const filename = path.basename(file.filename || "");
        if (!filename) {
            throw new Error("StorageService: upload is missing a filename");
        }
        if (!Buffer.isBuffer(file.buffer)) {
            const err = new Error("StorageService: upload is missing a file buffer");
            err.statusCode = 500;
            throw err;
        }
        await this.saveFile(tenantId, filename, file.buffer);
        return filename;
    }

    async deleteFile(tenantId, filename) {
        if (!filename || !tenantId) return false;
        const safe = path.basename(filename);
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

    async readObject(tenantId, filename) {
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

    async deleteTenantStorage(tenantId) {
        if (!tenantId || !this.bucketName()) return;
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
    }
}

module.exports = new StorageService();
module.exports.StorageService = StorageService;
