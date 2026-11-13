/**
 * Backfill intervalCount=1 on billing documents that predate multi-duration SKUs.
 *
 * Usage:
 *   node src/scripts/backfillPlanIntervalCount.js [--dry-run]
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PlanPrice = require("../models/PlanPrice");
const Tenant = require("../models/Tenant");
const ManualPayment = require("../models/ManualPayment");
const BillingEvent = require("../models/BillingEvent");

const MISSING = { $or: [{ intervalCount: { $exists: false } }, { intervalCount: null }] };

async function backfillPlanIntervalCount(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Backfill plan intervalCount ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const collections = [
        { name: "PlanPrice", model: PlanPrice },
        { name: "ManualPayment", model: ManualPayment },
        { name: "BillingEvent", model: BillingEvent },
    ];

    for (const { name, model } of collections) {
        const count = await model.countDocuments(MISSING);
        console.log(`${name}: ${count} document(s) missing intervalCount`);
        if (!isDryRun && count > 0) {
            const result = await model.updateMany(MISSING, { $set: { intervalCount: 1 } });
            console.log(`  → updated ${result.modifiedCount}`);
        }
    }

    const tenantMissing = {
        $or: [
            { "billing.intervalCount": { $exists: false } },
            { "billing.intervalCount": null },
        ],
    };
    const tenantCount = await Tenant.countDocuments(tenantMissing);
    console.log(`Tenant.billing: ${tenantCount} document(s) missing intervalCount`);
    if (!isDryRun && tenantCount > 0) {
        const result = await Tenant.updateMany(tenantMissing, {
            $set: { "billing.intervalCount": 1 },
        });
        console.log(`  → updated ${result.modifiedCount}`);
    }

    console.log("\nDone.\n");
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await backfillPlanIntervalCount();
            process.exit(0);
        } catch (err) {
            console.error("Backfill failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { backfillPlanIntervalCount };
