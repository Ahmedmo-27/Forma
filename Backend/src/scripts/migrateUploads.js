/**
 * Migration Script: Migrate Uploads to Tenant Directory
 *
 * Moves legacy flat files from `uploads/` into `uploads/{tenantId}/`.
 *
 * Usage:
 *   node src/scripts/migrateUploads.js [--dry-run] [--tenant-slug=leap]
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BASE_UPLOADS = path.resolve(__dirname, "../../uploads");

async function migrateUploads(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    const targetSlug = options.slug || "leap";

    console.log(`\n=== Running Uploads Migration ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Tenant = require("../models/Tenant");
    let tenant = await Tenant.findOne({ slug: targetSlug }) || await Tenant.findOne();

    if (!tenant) {
        if (isDryRun) {
            tenant = { _id: "default-leap-id", name: "Founding tenant (dry-run)" };
        } else {
            throw new Error(`Migration error: No tenant found with slug '${targetSlug}'. Create default tenant first.`);
        }
    }

    const tenantId = tenant._id.toString();
    const destDir = path.join(BASE_UPLOADS, tenantId);

    if (!fs.existsSync(destDir) && !isDryRun) {
        await fsPromises.mkdir(destDir, { recursive: true });
    }

    if (!fs.existsSync(BASE_UPLOADS)) {
        console.log("  Uploads directory does not exist yet. Nothing to relocate.");
        return { tenantId, movedCount: 0, skippedCount: 0 };
    }

    const entries = await fsPromises.readdir(BASE_UPLOADS, { withFileTypes: true });
    let movedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
        // Skip subdirectories (such as tenantId directories)
        if (entry.isDirectory()) {
            continue;
        }

        const srcPath = path.join(BASE_UPLOADS, entry.name);
        const destPath = path.join(destDir, entry.name);

        console.log(`  [FILE] ${entry.name} -> uploads/${tenantId}/${entry.name}`);

        if (!isDryRun) {
            await fsPromises.rename(srcPath, destPath);
        }
        movedCount++;
    }

    console.log(`\nMigration Summary:`);
    console.log(`  Target Tenant: ${tenant.name} (${tenantId})`);
    console.log(`  Files Moved: ${movedCount}`);
    console.log(`  Files Skipped: ${skippedCount}\n`);

    return { tenantId, movedCount, skippedCount };
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await migrateUploads();
            process.exit(0);
        } catch (err) {
            console.error("Uploads migration failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { migrateUploads };
