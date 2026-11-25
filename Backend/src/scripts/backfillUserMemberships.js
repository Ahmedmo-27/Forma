/**
 * Seed User.memberships[] from legacy top-level tenantId + role + locations.
 *
 * Usage:
 *   node src/scripts/backfillUserMemberships.js [--dry-run]
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const User = require("../models/User");
const { runAsPlatform } = require("../context/tenantContext");
const { seedMembershipsFromFields } = require("../utils/staffMembership");

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error("MONGO_URI is required");
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(dryRun ? "Dry run — no writes" : "Connected; backfilling memberships");

    const result = await runAsPlatform(async () => {
        const users = await User.find({
            $or: [
                { memberships: { $exists: false } },
                { memberships: { $size: 0 } },
            ],
            tenantId: { $exists: true, $ne: null },
        }).select("_id tenantId role allowedLocationIds canAccessAllLocations createdAt memberships");

        let updated = 0;
        for (const user of users) {
            const memberships = seedMembershipsFromFields(user);
            if (!memberships.length) continue;
            updated += 1;
            if (dryRun) {
                console.log(`Would seed ${user._id} → tenant ${user.tenantId} role ${user.role}`);
                continue;
            }
            user.memberships = memberships;
            await user.save();
        }
        return { scanned: users.length, updated };
    }, { reason: "backfill user memberships" });

    console.log(`Done. scanned=${result.scanned} updated=${result.updated}`);
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
