/**
 * Maintenance Script: Clean Missing Photos
 *
 * Scans all members in the database. If a member references a profile photo
 * that is not found on disk, sets `photo = null` to prevent continuous 404
 * requests in client browsers.
 *
 * Usage:
 *   node src/scripts/cleanMissingPhotos.js [--dry-run]
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const { runAsPlatform } = require("../context/tenantContext");
const Member = require("../models/Member");
const storageService = require("../services/storageService");

async function cleanMissingPhotos() {
    const isDryRun = process.argv.includes("--dry-run");
    console.log(`\n=== Cleaning Missing Profile Photos ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    await connectDB();

    await runAsPlatform(async () => {
        const membersWithPhotos = await Member.find({
            photo: { $ne: null, $exists: true }
        }).select("_id name photo tenantId");

        console.log(`Found ${membersWithPhotos.length} members with registered profile photos.`);

        let missingCount = 0;
        let preservedCount = 0;

        for (const member of membersWithPhotos) {
            const result = storageService.findFile(member.photo, [member.tenantId]);
            if (result.found) {
                preservedCount++;
            } else {
                missingCount++;
                console.log(`  [MISSING] Member ${member.name} (${member._id}): '${member.photo}' not found on disk.`);
                if (!isDryRun) {
                    await Member.updateOne({ _id: member._id }, { $set: { photo: null } });
                }
            }
        }

        console.log("\nSummary:");
        console.log(`  - Preserved (files on disk): ${preservedCount}`);
        console.log(`  - Cleaned up (missing on disk): ${missingCount}`);
    });

    await mongoose.disconnect();
    console.log("\nDone.\n");
}

if (require.main === module) {
    cleanMissingPhotos().catch((err) => {
        console.error("Failed to clean missing photos:", err);
        process.exit(1);
    });
}

module.exports = cleanMissingPhotos;
