const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;

const BASE_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

class StorageService {
    constructor(baseDir = BASE_UPLOADS_DIR) {
        this.baseDir = baseDir;
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    /**
     * Resolve the absolute directory for a specific tenant.
     * Creates directory if it does not exist.
     */
    getTenantDir(tenantId) {
        if (!tenantId) {
            throw new Error("StorageService: tenantId is required to resolve tenant storage directory");
        }
        const tenantDir = path.join(this.baseDir, String(tenantId));
        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }
        return tenantDir;
    }

    /**
     * Resolve the absolute file path for a tenant-scoped file.
     * Prevents path traversal attacks.
     */
    resolvePath(tenantId, filename) {
        const safeFilename = path.basename(filename);
        const tenantDir = this.getTenantDir(tenantId);
        const fullPath = path.resolve(tenantDir, safeFilename);

        // Security check: ensure resolved path remains inside tenant directory
        if (!fullPath.startsWith(tenantDir)) {
            throw new Error("StorageService: Access denied — path traversal attempt detected");
        }

        return fullPath;
    }

    /**
     * Check if a tenant file exists on disk.
     */
    async exists(tenantId, filename) {
        try {
            const filePath = this.resolvePath(tenantId, filename);
            await fsPromises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Save a buffer to tenant storage.
     * Returns the relative storage key: `${tenantId}/${filename}`
     */
    async saveFile(tenantId, filename, buffer) {
        const filePath = this.resolvePath(tenantId, filename);
        await fsPromises.writeFile(filePath, buffer);
        return `${tenantId}/${path.basename(filename)}`;
    }

    /**
     * Delete a tenant-scoped file.
     */
    async deleteFile(tenantId, filename) {
        try {
            const filePath = this.resolvePath(tenantId, filename);
            await fsPromises.unlink(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Generate access URL (returns relative /uploads URL locally;
     * ready for short-lived S3/R2 signed URLs).
     */
    async getSignedUrl(tenantId, filename, _expiresInSeconds = 3600) {
        const safe = path.basename(filename);
        return `/uploads/${safe}`;
    }
}

module.exports = new StorageService();
module.exports.StorageService = StorageService;
