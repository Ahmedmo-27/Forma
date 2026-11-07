/**
 * Rebuild daily BI snapshots for one gym or every active gym.
 *
 *   node src/scripts/backfillBiSnapshots.js --dry-run --from 2026-01-01 --to 2026-01-07
 *   node src/scripts/backfillBiSnapshots.js --tenant <id> --from 2026-01-01 --to 2026-01-31
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function arg(name) {
    const index = process.argv.indexOf(`--${name}`);
    if (index === -1) return null;
    return process.argv[index + 1] || null;
}

function eachDate(from, to) {
    const { addLocalDays } = require("../services/bi/time");
    const keys = [];
    let cursor = from;
    while (cursor <= to) {
        keys.push(cursor);
        cursor = addLocalDays(cursor, 1);
        if (keys.length > 800) break;
    }
    return keys;
}

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const from = arg("from");
    const to = arg("to");
    const tenantId = arg("tenant");
    if (!from || !to) {
        console.error("Pass --from YYYY-MM-DD and --to YYYY-MM-DD");
        process.exit(1);
    }
    const connectDB = require("../config/db");
    const Tenant = require("../models/Tenant");
    const { runAsPlatform, runWithTenant } = require("../context/tenantContext");
    const { snapshotTenant } = require("../services/bi/snapshotJob");
    await connectDB();
    const tenants = await runAsPlatform(() => {
        const query = { isSoftDeleted: { $ne: true }, status: { $nin: ["suspended", "cancelled"] } };
        if (tenantId) query._id = tenantId;
        return Tenant.find(query).select("name settings status");
    });
    const keys = eachDate(from, to);
    console.log(`${dryRun ? "DRY RUN" : "LIVE"} ${tenants.length} gyms, ${keys.length} days`);
    for (const tenant of tenants) {
        const result = await runWithTenant({ tenantId: String(tenant._id) }, () => snapshotTenant(tenant, {
            dateKeys: keys,
            dryRun,
        }));
        const sales = result.days.reduce((sum, day) => sum + (day.metrics.membershipSalesPiasters || 0), 0);
        console.log(`${tenant.name}: ${result.days.length} days, membership sales ${sales} piasters${dryRun ? " (not saved)" : ""}`);
    }
    process.exit(0);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { eachDate };
