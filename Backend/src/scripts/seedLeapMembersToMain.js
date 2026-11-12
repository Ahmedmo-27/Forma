/**
 * Seed all Leap tenant members onto the Main branch.
 *
 * 1. Resolve tenant slug "leap"
 * 2. Ensure Main location (LOC-001) exists
 * 3. Set every member's locationId → Main
 *
 * Usage:
 *   node src/scripts/seedLeapMembersToMain.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { runAsPlatform, runWithTenant } = require("../context/tenantContext");

const TENANT_SLUG = "leap";
const MAIN_NAME = "Main";
const MAIN_CODE = "LOC-001";

async function seedLeapMembersToMain(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Seed Leap members → Main ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Tenant = require("../models/Tenant");
    const Location = require("../models/Location");
    const Member = require("../models/Member");
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

            const totalMembers = await Member.countDocuments({ tenantId });
            const alreadyOnMain = await Member.countDocuments({ tenantId, locationId: main._id });
            const toUpdate = await Member.countDocuments({
                tenantId,
                locationId: { $ne: main._id },
            });

            console.log(`Members total:        ${totalMembers}`);
            console.log(`Already on Main:      ${alreadyOnMain}`);
            console.log(`Will set to Main:     ${toUpdate}`);

            let modifiedCount = 0;
            if (toUpdate > 0 && !isDryRun) {
                const result = await Member.updateMany(
                    { tenantId },
                    { $set: { locationId: main._id } }
                );
                modifiedCount = result.modifiedCount || 0;
                console.log(`Updated members:      ${modifiedCount}`);
            } else if (isDryRun) {
                console.log(`[dry-run] Would set locationId on ${toUpdate} member(s)`);
                modifiedCount = toUpdate;
            }

            const afterOnMain = isDryRun
                ? totalMembers
                : await Member.countDocuments({ tenantId, locationId: main._id });

            console.log(`\nDone.`);
            console.log(`  Main created:     ${createdMain}`);
            console.log(`  Members on Main:  ${afterOnMain} / ${totalMembers}`);
            console.log(`  Members updated:  ${modifiedCount}`);

            return {
                tenantId: String(tenantId),
                mainLocationId: String(main._id),
                createdMain,
                totalMembers,
                modifiedCount,
            };
        });
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
        await seedLeapMembersToMain();
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

module.exports = { seedLeapMembersToMain };
