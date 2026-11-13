/**
 * Safe Index Migration Script
 *
 * PRODUCTION ZERO-DOWNTIME ORDER OF OPERATIONS:
 * 1. Verify all documents have `tenantId` populated (run Phase 7 data migration first).
 * 2. CREATE new compound indexes `{ tenantId: 1, ... }` FIRST while legacy indexes remain in place.
 * 3. Verify that all new compound indexes have built successfully.
 * 4. DROP legacy global unique indexes (`systemId_1`, `memberId_1`, `barcode_1`).
 * Staff email, username, and phoneKey are globally unique again (not per gym).
 *
 * Usage:
 *   node src/scripts/migrateIndexes.js [--dry-run]
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const INDEX_OPERATIONS = [
    {
        collection: "users",
        newIndexes: [
            { keys: { email: 1 }, options: { unique: true, name: "email_1" } },
            {
                keys: { username: 1 },
                options: {
                    unique: true,
                    partialFilterExpression: { username: { $type: "string" } },
                    name: "username_1",
                },
            },
            {
                keys: { phoneKey: 1 },
                options: {
                    unique: true,
                    partialFilterExpression: { phoneKey: { $gt: "" } },
                    name: "phoneKey_1",
                },
            },
        ],
        legacyIndexesToDrop: ["tenantId_1_email_1", "tenantId_1_username_1"],
    },
    {
        collection: "members",
        newIndexes: [
            {
                keys: { tenantId: 1, systemId: 1 },
                options: {
                    unique: true,
                    partialFilterExpression: { systemId: { $type: "number" } },
                    name: "tenantId_1_systemId_1",
                },
            },
            {
                keys: { tenantId: 1, memberId: 1 },
                options: {
                    unique: true,
                    partialFilterExpression: { memberId: { $type: "number" } },
                    name: "tenantId_1_memberId_1",
                },
            },
            {
                keys: { tenantId: 1, barcode: 1 },
                options: {
                    unique: true,
                    partialFilterExpression: { barcode: { $type: "string" } },
                    name: "tenantId_1_barcode_1",
                },
            },
            { keys: { tenantId: 1, status: 1, systemId: 1 }, options: { name: "tenantId_1_status_1_systemId_1" } },
            { keys: { tenantId: 1, assignedSales: 1, status: 1 }, options: { name: "tenantId_1_assignedSales_1_status_1" } },
            { keys: { tenantId: 1, assignedSales: 1, systemId: 1 }, options: { name: "tenantId_1_assignedSales_1_systemId_1" } },
            { keys: { tenantId: 1, "subscriptions.startDate": 1 }, options: { name: "tenantId_1_subscriptions_startDate_1" } },
            { keys: { tenantId: 1, current_couch: 1 }, options: { name: "tenantId_1_current_couch_1" } },
            { keys: { tenantId: 1, isBlocked: 1 }, options: { name: "tenantId_1_isBlocked_1" } },
            { keys: { tenantId: 1, name: 1 }, options: { name: "tenantId_1_name_1" } },
            { keys: { tenantId: 1, phones: 1 }, options: { name: "tenantId_1_phones_1" } },
            {
                keys: { phoneKey: 1 },
                options: {
                    unique: true,
                    partialFilterExpression: { phoneKey: { $gt: "" } },
                    name: "phoneKey_1",
                },
            },
        ],
        legacyIndexesToDrop: ["systemId_1", "memberId_1", "barcode_1"],
    },
    {
        collection: "counters",
        newIndexes: [
            { keys: { tenantId: 1, name: 1 }, options: { unique: true, name: "tenantId_1_name_1" } },
        ],
        legacyIndexesToDrop: [],
    },
    {
        collection: "packages",
        newIndexes: [
            { keys: { tenantId: 1, name: 1, hasException: 1 }, options: { name: "tenantId_1_name_1_hasException_1" } },
            { keys: { tenantId: 1, isActive: 1 }, options: { name: "tenantId_1_isActive_1" } },
        ],
        legacyIndexesToDrop: [],
    },
    {
        collection: "packageexceptionrequests",
        newIndexes: [
            { keys: { tenantId: 1, member: 1, status: 1 }, options: { name: "tenantId_1_member_1_status_1" } },
        ],
        legacyIndexesToDrop: ["member_1_status_1"],
    },
    {
        collection: "auditlogs",
        newIndexes: [
            { keys: { tenantId: 1, action: 1, createdAt: -1 }, options: { name: "tenantId_1_action_1_createdAt_-1" } },
            { keys: { tenantId: 1, targetId: 1, createdAt: -1 }, options: { name: "tenantId_1_targetId_1_createdAt_-1" } },
        ],
        legacyIndexesToDrop: ["action_1_createdAt_-1", "targetId_1_createdAt_-1"],
    },
    {
        collection: "notifications",
        newIndexes: [
            { keys: { tenantId: 1, recipient: 1, read: 1, createdAt: -1 }, options: { name: "tenantId_1_recipient_1_read_1_createdAt_-1" } },
        ],
        legacyIndexesToDrop: ["recipient_1_read_1_createdAt_-1"],
    },
    {
        collection: "whatsapptemplates",
        newIndexes: [
            { keys: { tenantId: 1, name: 1, type: 1 }, options: { name: "tenantId_1_name_1_type_1" } },
            { keys: { tenantId: 1, type: 1, isDefault: 1 }, options: { name: "tenantId_1_type_1_isDefault_1" } },
        ],
        legacyIndexesToDrop: [],
    },
];

async function migrateIndexes(options = { isDryRun: false }) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Running Index Migration ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const db = mongoose.connection.db;

    for (const item of INDEX_OPERATIONS) {
        console.log(`\nProcessing collection: ${item.collection}`);
        const coll = db.collection(item.collection);

        if (item.collection === "counters" && !isDryRun) {
            const legacyDeleted = await coll.deleteMany({
                $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
            });
            if (legacyDeleted.deletedCount > 0) {
                console.log(`  [CLEANUP] Removed ${legacyDeleted.deletedCount} legacy unscoped counter documents.`);
            }
        }

        const existingIndexes = await coll.indexes().catch(() => []);
        const existingNames = new Set(existingIndexes.map((idx) => idx.name));

        // Step 1: Create new compound indexes
        for (const idx of item.newIndexes) {
            const hasSameKeys = existingIndexes.some((e) => JSON.stringify(e.key) === JSON.stringify(idx.keys));
            if (hasSameKeys || existingNames.has(idx.options?.name)) {
                console.log(`  [EXISTS] Index with keys ${JSON.stringify(idx.keys)} already in place.`);
            } else {
                console.log(`  [CREATE] Creating index with keys:`, idx.keys);
                if (!isDryRun) {
                    try {
                        await coll.createIndex(idx.keys, idx.options || {});
                        console.log(`  [CREATED] Index successfully created.`);
                    } catch (err) {
                        if (err.code === 85) {
                            console.log(`  [EXISTS] Index options conflict (already created): ${err.message}`);
                        } else {
                            throw err;
                        }
                    }
                }
            }
        }

        // Step 2: Drop legacy indexes
        for (const legacyName of item.legacyIndexesToDrop) {
            if (existingNames.has(legacyName)) {
                console.log(`  [DROP] Dropping legacy index ${legacyName}...`);
                if (!isDryRun) {
                    await coll.dropIndex(legacyName);
                    console.log(`  [DROPPED] Legacy index ${legacyName} dropped.`);
                }
            } else {
                console.log(`  [SKIP] Legacy index ${legacyName} does not exist.`);
            }
        }
    }

    console.log("\nIndex migration completed successfully.\n");
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await migrateIndexes();
            process.exit(0);
        } catch (err) {
            console.error("Index migration failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { migrateIndexes, INDEX_OPERATIONS };
