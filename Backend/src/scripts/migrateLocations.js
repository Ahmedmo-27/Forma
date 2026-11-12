/**
 * Multi-branch locations migration
 *
 * 1. For every tenant, ensure a Main location (LOC-001) exists
 * 2. Backfill members missing locationId → Main
 * 3. Set Owner + General Manager canAccessAllLocations = true
 * 4. Sync TenantUsage.branchCount
 *
 * Usage:
 *   node src/scripts/migrateLocations.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { runAsPlatform, runWithTenant } = require("../context/tenantContext");

async function migrateLocations(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Migrating Locations ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Tenant = require("../models/Tenant");
    const Location = require("../models/Location");
    const Member = require("../models/Member");
    const User = require("../models/User");
    const TenantUsage = require("../models/TenantUsage");
    const Counter = require("../models/Counter");

    return runAsPlatform(async () => {
        const tenants = await Tenant.find({}).select("_id name slug").lean();
        console.log(`Found ${tenants.length} tenant(s)`);

        let createdLocations = 0;
        let backfilledMembers = 0;
        let updatedUsers = 0;

        for (const tenant of tenants) {
            const tenantId = tenant._id;
            console.log(`\n— Tenant ${tenant.slug || tenant.name} (${tenantId})`);

            await runWithTenant({ tenantId: String(tenantId), tenantSlug: tenant.slug }, async () => {
                let main = await Location.findOne({ tenantId }).sort({ createdAt: 1 });
                if (!main) {
                    console.log("  Creating Main / LOC-001");
                    if (!isDryRun) {
                        main = await Location.create({
                            name: "Main",
                            locationId: "LOC-001",
                            branch_location: "",
                            tenantId,
                        });
                        await Counter.findOneAndUpdate(
                            { tenantId, name: "locationId" },
                            { $max: { seq: 1 }, $setOnInsert: { seq: 1 } },
                            { upsert: true, new: true }
                        );
                    }
                    createdLocations += 1;
                } else {
                    console.log(`  Existing first location: ${main.name} (${main.locationId})`);
                }

                if (!main && isDryRun) {
                    // Dry-run without a real location id — skip member backfill counts accurately
                    console.log("  [dry-run] Would backfill members without locationId");
                } else if (main) {
                    const missingFilter = {
                        tenantId,
                        $or: [{ locationId: null }, { locationId: { $exists: false } }],
                    };
                    const missingCount = await Member.countDocuments(missingFilter);
                    console.log(`  Members missing locationId: ${missingCount}`);
                    if (missingCount && !isDryRun) {
                        const result = await Member.updateMany(missingFilter, {
                            $set: { locationId: main._id },
                        });
                        backfilledMembers += result.modifiedCount || 0;
                    } else {
                        backfilledMembers += missingCount;
                    }
                }

                const userFilter = {
                    tenantId,
                    role: { $in: ["Owner", "General Manager"] },
                    canAccessAllLocations: { $ne: true },
                };
                const usersToUpdate = await User.countDocuments(userFilter);
                console.log(`  Owner/GM needing canAccessAllLocations: ${usersToUpdate}`);
                if (usersToUpdate && !isDryRun) {
                    const result = await User.updateMany(userFilter, {
                        $set: { canAccessAllLocations: true, allowedLocationIds: [] },
                    });
                    updatedUsers += result.modifiedCount || 0;
                } else {
                    updatedUsers += usersToUpdate;
                }

                const branchCount = await Location.countDocuments({ tenantId });
                console.log(`  branchCount → ${branchCount}`);
                if (!isDryRun) {
                    await TenantUsage.findOneAndUpdate(
                        { tenantId },
                        { $set: { branchCount, refreshedAt: new Date() } },
                        { upsert: true }
                    );
                }
            });
        }

        console.log(`\nDone.`);
        console.log(`  Locations created: ${createdLocations}`);
        console.log(`  Members backfilled: ${backfilledMembers}`);
        console.log(`  Users updated: ${updatedUsers}`);
        return { createdLocations, backfilledMembers, updatedUsers };
    });
}

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("MONGO_URI is required");
        process.exit(1);
    }
    await mongoose.connect(uri);
    try {
        await migrateLocations();
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { migrateLocations };
