/**
 * Full Multi-Tenant Migration Script
 *
 * 1. Creates default Tenant for "Leap Gym" (slug: "leap") on Platinum Plan.
 * 2. Backfills `tenantId` across all collections (batched, resumable, idempotent).
 * 3. Initializes per-tenant counters from current max identifiers.
 * 4. Relocates flat upload files into `uploads/{tenantId}/`.
 * 5. Verifies zero documents without tenantId remain across all collections.
 *
 * Usage:
 *   node src/scripts/migrateToMultitenant.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { seedPlans } = require("./seedPlans");
const { migrateUploads } = require("./migrateUploads");
const { runAsPlatform } = require("../context/tenantContext");

const COLLECTIONS_TO_BACKFILL = [
    "users",
    "members",
    "packages",
    "packageexceptionrequests",
    "auditlogs",
    "notifications",
    "coachreprequests",
    "salesreprequests",
    "profileviews",
    "whatsapptemplates",
];

async function migrateToMultitenant(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n============================================================`);
    console.log(`  LEAP MULTI-TENANT MIGRATION ${isDryRun ? "[DRY RUN]" : "[LIVE]"}`);
    console.log(`============================================================\n`);

    return runAsPlatform(async () => {
        const db = mongoose.connection.db;

        // Step 1: Ensure plans are seeded
        console.log("--- Step 1: Seeding Plans ---");
        await seedPlans({ isDryRun });

        const Plan = require("../models/Plan");
        const platinumPlan = await Plan.findOne({ key: "platinum" });
        if (!platinumPlan && !isDryRun) {
            throw new Error("Migration error: Platinum plan could not be found.");
        }

        // Step 2: Ensure Default Tenant (Leap Gym) exists
        console.log("\n--- Step 2: Ensuring Default Tenant (Leap Gym) ---");
        const Tenant = require("../models/Tenant");
        let defaultTenant = await Tenant.findOne({ slug: "leap" });

        if (!defaultTenant) {
            console.log("  [CREATE] Creating default tenant: 'Leap Gym' (slug: leap)...");
            if (!isDryRun) {
                defaultTenant = await Tenant.create({
                    name: "Leap Gym",
                    slug: "leap",
                    status: "active",
                    planId: platinumPlan._id,
                    featureOverrides: { add: [], remove: [] },
                    limitOverrides: { maxMembers: null, maxStaff: null, maxBranches: null },
                    settings: {
                        branding: {
                            displayName: "Leap Gym",
                            palette: {
                                primary: "#44298C",
                                secondary: "#5B38BA",
                                accent: "#6D47CC",
                                background: "#F4F5F7",
                                text: "#111827",
                            },
                        },
                        locale: {
                            currency: "EGP",
                            timezone: "Africa/Cairo",
                            language: "en",
                        },
                        enabledActivities: [
                            "gym", "crossfit", "box", "mma", "kickboxing", "calisthenics",
                        ],
                    },
                });
                console.log(`  [CREATED] Default tenant ID: ${defaultTenant._id}`);
            } else {
                defaultTenant = { _id: new mongoose.Types.ObjectId(), slug: "leap", name: "Leap Gym" };
                console.log(`  [DRY RUN] Would create default tenant: 'Leap Gym' (ID: ${defaultTenant._id})`);
            }
        } else {
            console.log(`  [EXISTS] Default tenant 'Leap Gym' found: ${defaultTenant._id}`);
        }

        const tenantId = defaultTenant._id;

        // Step 3: Batched Backfill across all collections
        console.log("\n--- Step 3: Backfilling tenantId on Collections ---");
        const summary = {};

        for (const colName of COLLECTIONS_TO_BACKFILL) {
            const coll = db.collection(colName);
            const totalDocs = await coll.countDocuments();
            const unassignedDocs = await coll.countDocuments({
                $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
            });

            console.log(`Collection [${colName}]: Total = ${totalDocs}, Unassigned = ${unassignedDocs}`);

            if (unassignedDocs > 0) {
                if (!isDryRun) {
                    const batchSize = 500;
                    let modified = 0;
                    let remaining = unassignedDocs;

                    while (remaining > 0) {
                        const docsToUpdate = await coll
                            .find({ $or: [{ tenantId: { $exists: false } }, { tenantId: null }] })
                            .project({ _id: 1 })
                            .limit(batchSize)
                            .toArray();

                        if (docsToUpdate.length === 0) break;

                        const ids = docsToUpdate.map((d) => d._id);
                        const res = await coll.updateMany(
                            { _id: { $in: ids } },
                            { $set: { tenantId } }
                        );
                        modified += res.modifiedCount;
                        remaining -= docsToUpdate.length;
                    }
                    console.log(`  -> Backfilled ${modified} documents in '${colName}'`);
                    summary[colName] = { total: totalDocs, backfilled: modified };
                } else {
                    console.log(`  -> [DRY RUN] Would backfill ${unassignedDocs} documents in '${colName}'`);
                    summary[colName] = { total: totalDocs, backfilled: unassignedDocs };
                }
            } else {
                console.log(`  -> 0 documents needed backfilling in '${colName}'`);
                summary[colName] = { total: totalDocs, backfilled: 0 };
            }
        }

        // Step 4: Seed Per-Tenant Counters
        console.log("\n--- Step 4: Initializing Per-Tenant Counters ---");
        const Member = require("../models/Member");
        const Counter = require("../models/Counter");

        const lastSystem = await Member.collection.findOne({}, { sort: { systemId: -1 }, projection: { systemId: 1 } });
        const lastMember = await Member.collection.findOne(
            { memberId: { $ne: null } },
            { sort: { memberId: -1 }, projection: { memberId: 1 } }
        );

        const subAgg = await Member.collection.aggregate([
            { $unwind: "$subscriptions" },
            { $group: { _id: null, maxId: { $max: "$subscriptions.subscriptionId" } } },
        ]).toArray();

        const maxSystemId = Math.max(lastSystem?.systemId || 99999, 99999);
        const maxMemberId = Math.max(lastMember?.memberId || 99, 99);
        const maxSubscriptionId = Math.max(subAgg[0]?.maxId || 99, 99);

        console.log(`  Counter baselines: systemId=${maxSystemId}, memberId=${maxMemberId}, subscriptionId=${maxSubscriptionId}`);

        if (!isDryRun) {
            await Counter.collection.updateOne(
                { tenantId, name: "systemId" },
                { $max: { seq: maxSystemId } },
                { upsert: true }
            );
            await Counter.collection.updateOne(
                { tenantId, name: "memberId" },
                { $max: { seq: maxMemberId } },
                { upsert: true }
            );
            await Counter.collection.updateOne(
                { tenantId, name: "subscriptionId" },
                { $max: { seq: maxSubscriptionId } },
                { upsert: true }
            );
            console.log("  Counters initialized successfully.");
        } else {
            console.log("  [DRY RUN] Would upsert counters for tenant.");
        }

        // Step 5: Relocate Uploads
        console.log("\n--- Step 5: Relocating Upload Files ---");
        await migrateUploads({ slug: "leap", isDryRun });

        // Step 6: Verification
        console.log("\n--- Step 6: Post-Migration Verification ---");
        let failedCollections = [];

        if (!isDryRun) {
            for (const colName of COLLECTIONS_TO_BACKFILL) {
                const remaining = await db.collection(colName).countDocuments({
                    $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
                });
                if (remaining > 0) {
                    failedCollections.push({ colName, remaining });
                }
            }

            if (failedCollections.length > 0) {
                console.error("\nVERIFICATION FAILED: Unassigned documents remain:", failedCollections);
                throw new Error(`Migration verification failed for collections: ${failedCollections.map((f) => f.colName).join(", ")}`);
            } else {
                console.log("  ALL collections verified: 0 unassigned documents remain! (100% tenant-scoped)");
            }
        } else {
            console.log("  [DRY RUN] Verification skipped.");
        }

        console.log("\n============================================================");
        console.log("  MIGRATION COMPLETE");
        console.log("============================================================\n");

        return { tenantId, summary };
    }, { reason: "multi_tenant_full_migration" });
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await migrateToMultitenant();
            process.exit(0);
        } catch (err) {
            console.error("Migration failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { migrateToMultitenant };
