const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectMongo = require("../../src/config/connectMongo");
const Member = require("../../src/models/Member");
const Counter = require("../../src/models/Counter");
const { runWithTenant } = require("../../src/context/tenantContext");

const ALLOWED_PREFIXES = new Set(["0198", "0199"]);

function perfFilter(userId, prefix) {
    if (!ALLOWED_PREFIXES.has(prefix)) {
        throw new Error(`Refusing cleanup for unexpected phone prefix ${prefix}`);
    }
    return {
        phones: new RegExp(`^${prefix}\\d{7}$`),
        name: /^Perf Test /,
        source: "data entry",
        isMember: false,
        createdBy: userId,
    };
}

async function ensureDb() {
    if (mongoose.connection.readyState === 1) return;
    await connectMongo();
}

async function countPerfMembers({ tenantId, userId, prefix }) {
    await ensureDb();
    return runWithTenant({ tenantId }, async () => {
        return Member.countDocuments(perfFilter(userId, prefix));
    });
}

async function readSystemSeq(tenantId) {
    await ensureDb();
    const doc = await Counter.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        name: "systemId",
    }).select("seq").lean();
    return doc ? doc.seq : null;
}

/**
 * Delete only this user's synthetic import rows.
 * Refuses to delete when the match count is not the number we inserted.
 */
async function cleanupPerfMembers({ tenantId, userId, prefix, expected, maxRows }) {
    await ensureDb();
    const filter = perfFilter(userId, prefix);
    const counted = await runWithTenant({ tenantId }, async () => Member.countDocuments(filter));

    if (counted === 0 && expected === 0) {
        return { counted: 0, deleted: 0 };
    }
    if (counted !== expected) {
        throw new Error(
            `Cleanup stopped for ${prefix}: found ${counted} matching members, expected ${expected}. Nothing was deleted.`
        );
    }
    if (maxRows != null && counted > maxRows) {
        throw new Error(
            `Cleanup stopped for ${prefix}: found ${counted} matching members, above the ${maxRows} row cap. Nothing was deleted.`
        );
    }

    const result = await runWithTenant({ tenantId }, async () => Member.deleteMany(filter));
    return { counted, deleted: result.deletedCount || 0 };
}

async function disconnectDb() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const prefix = args[args.indexOf("--prefix") + 1];
    const expected = Number(args[args.indexOf("--expected") + 1]);
    const tenantId = process.env.PERF_TENANT_ID;
    const userId = process.env.PERF_USER_ID;
    cleanupPerfMembers({ tenantId, userId, prefix, expected, maxRows: expected })
        .then((result) => {
            console.log(JSON.stringify(result));
            return disconnectDb();
        })
        .catch(async (error) => {
            console.error(error.message);
            await disconnectDb();
            process.exit(1);
        });
}

module.exports = {
    countPerfMembers,
    cleanupPerfMembers,
    readSystemSeq,
    disconnectDb,
};
