/**
 * Seed Leap tenant staff branch grants onto Main.
 *
 * 1. Resolve tenant slug "leap"
 * 2. Ensure Main location (LOC-001) exists
 * 3. Owner → canAccessAllLocations = true (no branch list needed)
 * 4. All other users → allowedLocationIds = [Main], canAccessAllLocations = false
 *
 * Usage:
 *   node src/scripts/seedLeapUsersToMain.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const connectMongo = require("../config/connectMongo");
const { runAsPlatform, runWithTenant } = require("../context/tenantContext");

const TENANT_SLUG = "leap";
const MAIN_NAME = "Main";
const MAIN_CODE = "LOC-001";

async function seedLeapUsersToMain(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Seed Leap users → Main ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Tenant = require("../models/Tenant");
    const Location = require("../models/Location");
    const User = require("../models/User");
    const Counter = require("../models/Counter");

    return runAsPlatform(async () => {
        const tenant = await Tenant.findOne({ slug: TENANT_SLUG }).select("_id name slug").lean();
        if (!tenant) {
            throw new Error(`Tenant with slug "${TENANT_SLUG}" not found`);
        }

        const tenantId = tenant._id;
        console.log(`Tenant: ${tenant.name || tenant.slug} (${tenantId})`);

        return runWithTenant({ tenantId: String(tenantId), tenantSlug: tenant.slug }, async () => {
            let main =
                (await Location.findOne({ tenantId, locationId: MAIN_CODE })) ||
                (await Location.findOne({ tenantId, name: MAIN_NAME }));

            let createdMain = false;
            if (!main) {
                console.log(`Creating ${MAIN_NAME} / ${MAIN_CODE}`);
                if (!isDryRun) {
                    main = await Location.create({
                        name: MAIN_NAME,
                        locationId: MAIN_CODE,
                        branch_location: "",
                        tenantId,
                    });
                    await Counter.findOneAndUpdate(
                        { tenantId, name: "locationId" },
                        { $max: { seq: 1 }, $setOnInsert: { seq: 1 } },
                        { upsert: true, new: true }
                    );
                } else {
                    main = { _id: new mongoose.Types.ObjectId(), name: MAIN_NAME, locationId: MAIN_CODE };
                }
                createdMain = true;
            }

            console.log(`Main branch: ${main.name} (${main.locationId}) _id=${main._id}`);

            const totalUsers = await User.countDocuments({ tenantId });
            const owners = await User.countDocuments({ tenantId, role: "Owner" });
            const staffCount = totalUsers - owners;

            const alreadyOnMain = await User.countDocuments({
                tenantId,
                role: { $ne: "Owner" },
                canAccessAllLocations: false,
                allowedLocationIds: main._id,
            });

            console.log(`Users total:          ${totalUsers}`);
            console.log(`Owners (all access):  ${owners}`);
            console.log(`Staff to set → Main:  ${staffCount}`);
            console.log(`Staff already Main:   ${alreadyOnMain}`);

            let ownersUpdated = 0;
            let staffUpdated = 0;

            if (!isDryRun) {
                const ownerResult = await User.updateMany(
                    { tenantId, role: "Owner" },
                    { $set: { canAccessAllLocations: true, allowedLocationIds: [] } }
                );
                ownersUpdated = ownerResult.modifiedCount || 0;

                const staffResult = await User.updateMany(
                    { tenantId, role: { $ne: "Owner" } },
                    {
                        $set: {
                            canAccessAllLocations: false,
                            allowedLocationIds: [main._id],
                        },
                    }
                );
                staffUpdated = staffResult.modifiedCount || 0;
            } else {
                console.log(`[dry-run] Would set Owner canAccessAllLocations=true (${owners})`);
                console.log(`[dry-run] Would set allowedLocationIds=[Main] on ${staffCount} staff`);
                ownersUpdated = owners;
                staffUpdated = staffCount;
            }

            const afterOnMain = isDryRun
                ? staffCount
                : await User.countDocuments({
                    tenantId,
                    role: { $ne: "Owner" },
                    canAccessAllLocations: false,
                    allowedLocationIds: main._id,
                });

            console.log(`\nDone.`);
            console.log(`  Main created:       ${createdMain}`);
            console.log(`  Owners updated:     ${ownersUpdated}`);
            console.log(`  Staff on Main:      ${afterOnMain} / ${staffCount}`);
            console.log(`  Staff updated:      ${staffUpdated}`);

            return {
                tenantId: String(tenantId),
                mainLocationId: String(main._id),
                createdMain,
                totalUsers,
                ownersUpdated,
                staffUpdated,
            };
        });
    });
}

async function main() {
    await connectMongo();
    try {
        await seedLeapUsersToMain();
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

module.exports = { seedLeapUsersToMain };
