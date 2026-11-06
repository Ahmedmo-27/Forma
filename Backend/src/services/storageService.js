const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;

const BASE_UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.cwd(), process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../uploads");

class StorageService {
    constructor(baseDir = BASE_UPLOADS_DIR) {
        this.baseDir = baseDir;
        this.driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
        this.r2Configured = Boolean(
            process.env.R2_BUCKET_NAME ||
            process.env.AWS_S3_BUCKET ||
            (process.env.STORAGE_DRIVER === "r2")
        );

        if (!fs.existsSync(this.baseDir)) {
            try {
                fs.mkdirSync(this.baseDir, { recursive: true });
            } catch (_) {}
        }
    }

    /**
     * Active storage driver name ('local' | 'r2' | 's3').
     */
    getDriverName() {
        return this.driver;
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
            const result = this.findFile(filename, [tenantId]);
            return result.found;
        } catch {
            return false;
        }
    }

    /**
     * Search for a file across tenant directory and legacy root uploads folder.
     * @param {string} filename - Filename to locate
     * @param {Array<string>|string} tenantCandidates - Candidate tenant ID(s)
     * @returns {{ found: boolean, filePath: string | null, tenantId: string | null }}
     */
    findFile(filename, tenantCandidates = []) {
        if (!filename) return { found: false, filePath: null, tenantId: null };
        const safe = path.basename(filename);
        if (safe !== filename || safe.includes("..")) {
            return { found: false, filePath: null, tenantId: null };
        }

        const candidates = (Array.isArray(tenantCandidates) ? tenantCandidates : [tenantCandidates])
            .filter(Boolean)
            .map(String);

        // 1. Check candidate tenant directories first
        for (const tId of candidates) {
            try {
                const tenantDir = path.join(this.baseDir, tId);
                const candidatePath = path.resolve(tenantDir, safe);
                if (candidatePath.startsWith(tenantDir) && fs.existsSync(candidatePath)) {
                    return { found: true, filePath: candidatePath, tenantId: tId };
                }
            } catch (_) {}
        }

        // 2. Check root uploadsDir for unmigrated flat legacy files
        try {
            const rootPath = path.resolve(this.baseDir, safe);
            if (path.dirname(rootPath) === this.baseDir && fs.existsSync(rootPath)) {
                return { found: true, filePath: rootPath, tenantId: null };
            }
        } catch (_) {}

        // 3. Fallback: scan tenant subdirectories (e.g. for public assets like logos)
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
     * Delete a tenant-scoped file from tenant storage and legacy root directory.
     */
    async deleteFile(tenantId, filename) {
        if (!filename) return false;
        const safe = path.basename(filename);
        let deleted = false;

        // Delete from tenant dir
        if (tenantId) {
            try {
                const filePath = this.resolvePath(tenantId, safe);
                await fsPromises.unlink(filePath);
                deleted = true;
            } catch (_) {}
        }

        // Also clean up root uploads directory if an unmigrated copy exists
        try {
            const rootPath = path.resolve(this.baseDir, safe);
            if (path.dirname(rootPath) === this.baseDir && fs.existsSync(rootPath)) {
                await fsPromises.unlink(rootPath);
                deleted = true;
            }
        } catch (_) {}

        return deleted;
    }

    /**
     * Generate access URL (returns relative /uploads URL for local storage;
     * ready for short-lived S3/R2 signed URLs once R2 credentials are provided).
     */
    async getSignedUrl(tenantId, filename, _expiresInSeconds = 3600) {
        const safe = path.basename(filename);
        return `/uploads/${encodeURIComponent(safe)}`;
    }
}

module.exports = new StorageService();
module.exports.StorageService = StorageService;
