/**
 * Restore one gym's data from a backup without touching any other gym.
 *
 * 1. Restore the dump into a scratch database (see docs/BACKUP_RESTORE.md).
 * 2. Dry run:  node src/scripts/restoreTenantFromBackup.js --from "<scratch uri>" --tenant <id-or-slug>
 * 3. Apply:    add --apply. Existing documents are kept unless --overwrite is passed.
 *
 * Copies the tenant document plus every document whose tenantId matches, in
 * every collection that has them. Uses the raw driver so tenant scoping and
 * model hooks do not interfere.
 */
const path = require("path");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongoose").mongo;

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BATCH_SIZE = 500;
// Platform-wide collections never belong to a single gym.
const SKIP_COLLECTIONS = new Set([
    "tenants",
    "plans",
    "planprices",
    "features",
    "platformusers",
    "platformadmins",
    "platformsettings",
    "platformcounters",
    "platformmetricsnapshots",
    "coupons",
    "auditdeadletters",
    "scheduledjobruns",
    "schedulerlocks",
]);

function parseArgs(argv) {
    const args = { apply: false, overwrite: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--apply") args.apply = true;
        else if (arg === "--overwrite") args.overwrite = true;
        else if (arg === "--from") args.from = argv[++i];
        else if (arg === "--to") args.to = argv[++i];
        else if (arg === "--tenant") args.tenant = argv[++i];
    }
    args.to = args.to || process.env.MONGO_URI;
    return args;
}

function tenantFilter(ref) {
    return /^[a-f0-9]{24}$/i.test(ref) ? { _id: new ObjectId(ref) } : { slug: String(ref).toLowerCase() };
}

async function copyCollection({ source, target, name, filter, apply, overwrite }) {
    const cursor = source.collection(name).find(filter);
    const result = { collection: name, found: 0, written: 0, kept: 0 };
    let batch = [];

    const flush = async () => {
        if (!batch.length) return;
        if (apply) {
            const ops = batch.map((doc) =>
                overwrite
                    ? { replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } }
                    : { updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } }
            );
            const res = await target.collection(name).bulkWrite(ops, { ordered: false });
            const written = (res.upsertedCount || 0) + (overwrite ? res.modifiedCount || 0 : 0);
            result.written += written;
            result.kept += batch.length - written;
        } else {
            const ids = batch.map((doc) => doc._id);
            const existing = await target.collection(name).countDocuments({ _id: { $in: ids } });
            result.kept += overwrite ? 0 : existing;
            result.written += overwrite ? batch.length : batch.length - existing;
        }
        batch = [];
    };

    for await (const doc of cursor) {
        result.found += 1;
        batch.push(doc);
        if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
    return result;
}

async function restoreTenant(options) {
    const { from, to, tenant: tenantRef, apply, overwrite } = options;
    if (!from || !to || !tenantRef) {
        throw new Error("Usage: --from <scratch uri> --tenant <id-or-slug> [--to <target uri>] [--apply] [--overwrite]");
    }
    if (from === to) throw new Error("--from and --to must be different databases");

    const sourceClient = await MongoClient.connect(from);
    const targetClient = await MongoClient.connect(to);
    try {
        const source = sourceClient.db();
        const target = targetClient.db();

        const tenant = await source.collection("tenants").findOne(tenantFilter(tenantRef));
        if (!tenant) throw new Error(`Tenant '${tenantRef}' not found in the backup`);
        const tenantId = tenant._id;

        console.log(`\n${apply ? "RESTORING" : "DRY RUN for"} ${tenant.name} (${tenant.slug}, ${tenantId})`);
        console.log(`  from: ${source.databaseName}   to: ${target.databaseName}   mode: ${overwrite ? "overwrite" : "insert missing only"}\n`);

        const results = [
            await copyCollection({ source, target, name: "tenants", filter: { _id: tenantId }, apply, overwrite }),
        ];

        const collections = await source.listCollections({}, { nameOnly: true }).toArray();
        for (const { name } of collections) {
            if (name.startsWith("system.") || SKIP_COLLECTIONS.has(name)) continue;
            const filter = { tenantId };
            if (!(await source.collection(name).countDocuments(filter, { limit: 1 }))) continue;
            results.push(await copyCollection({ source, target, name, filter, apply, overwrite }));
        }

        console.table(results);
        if (!apply) console.log("\nNothing was written. Re-run with --apply to restore.\n");
        return results;
    } finally {
        await Promise.allSettled([sourceClient.close(), targetClient.close()]);
    }
}

if (require.main === module) {
    restoreTenant(parseArgs(process.argv.slice(2)))
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(`Restore failed: ${error.message}`);
            process.exit(1);
        });
}

module.exports = { restoreTenant, copyCollection, parseArgs, SKIP_COLLECTIONS };
