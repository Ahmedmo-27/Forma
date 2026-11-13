/**
 * Migration: Rename role "Coach Manager" → "Head Coach"
 *
 * Updates:
 *   - User.role
 *   - Plan.allowedRoles (and nested plan docs that store role strings)
 *   - WhatsAppTemplate role allow-lists when present
 *   - Tenant.roleAccess map keys when "Coach Manager" is a saved checklist role
 *
 * Usage:
 *   node src/scripts/migrateCoachManagerToHeadCoach.js [--dry-run]
 *   npm run migrate:head-coach -- [--dry-run]
 */

const path = require("path");
const dns = require("dns");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

// Windows / ISP resolvers sometimes refuse SRV (querySrv ECONNREFUSED) for mongodb+srv.
// Prefer public DNS so Atlas SRV/TXT lookups succeed before mongoose.connect.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { runAsPlatform, runWithTenant } = require("../context/tenantContext");

const OLD_ROLE = "Coach Manager";
const NEW_ROLE = "Head Coach";

function replaceRoleInArray(list) {
    if (!Array.isArray(list)) return { list, changed: false };
    let changed = false;
    const next = list.map((role) => {
        if (role === OLD_ROLE) {
            changed = true;
            return NEW_ROLE;
        }
        return role;
    });
    // Dedupe if both old and new somehow existed
    const deduped = [...new Set(next)];
    if (deduped.length !== next.length) changed = true;
    return { list: deduped, changed };
}

async function migrateCoachManagerToHeadCoach(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Migrate ${OLD_ROLE} → ${NEW_ROLE} ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Tenant = require("../models/Tenant");
    const User = require("../models/User");
    const Plan = require("../models/Plan");
    const WhatsAppTemplate = require("../models/WhatsAppTemplate");

    return runAsPlatform(async () => {
        const summary = {
            users: 0,
            plans: 0,
            templates: 0,
            tenantsRoleAccess: 0,
        };

        // Platform-scoped plans
        const plans = await Plan.find({}).select("_id name allowedRoles").lean();
        for (const plan of plans) {
            const { list, changed } = replaceRoleInArray(plan.allowedRoles);
            if (!changed) continue;
            console.log(`  Plan ${plan.name || plan._id}: allowedRoles updated`);
            summary.plans += 1;
            if (!isDryRun) {
                await Plan.updateOne({ _id: plan._id }, { $set: { allowedRoles: list } });
            }
        }

        const tenants = await Tenant.find({}).select("_id name slug roleAccess").lean();
        console.log(`Found ${tenants.length} tenant(s)`);

        for (const tenant of tenants) {
            const tenantId = tenant._id;
            console.log(`\n— Tenant ${tenant.slug || tenant.name} (${tenantId})`);

            await runWithTenant({ tenantId: String(tenantId), tenantSlug: tenant.slug }, async () => {
                const userFilter = { tenantId, role: OLD_ROLE };
                const userCount = await User.countDocuments(userFilter);
                console.log(`  Users with role "${OLD_ROLE}": ${userCount}`);
                if (userCount) {
                    summary.users += userCount;
                    if (!isDryRun) {
                        await User.updateMany(userFilter, { $set: { role: NEW_ROLE } });
                    }
                }

                // Tenant roleAccess checklist keyed by role name
                const roleAccess = tenant.roleAccess;
                if (roleAccess && typeof roleAccess === "object") {
                    const plain =
                        typeof roleAccess.toObject === "function"
                            ? roleAccess.toObject()
                            : roleAccess instanceof Map
                              ? Object.fromEntries(roleAccess.entries())
                              : { ...roleAccess };
                    if (Object.prototype.hasOwnProperty.call(plain, OLD_ROLE)) {
                        console.log(`  Tenant roleAccess: move "${OLD_ROLE}" → "${NEW_ROLE}"`);
                        summary.tenantsRoleAccess += 1;
                        if (!isDryRun) {
                            const value = plain[OLD_ROLE];
                            const next = { ...plain };
                            delete next[OLD_ROLE];
                            if (!Object.prototype.hasOwnProperty.call(next, NEW_ROLE)) {
                                next[NEW_ROLE] = value;
                            }
                            await Tenant.updateOne({ _id: tenantId }, { $set: { roleAccess: next } });
                        }
                    }
                }

                const templates = await WhatsAppTemplate.find({
                    tenantId,
                    allowedRoles: OLD_ROLE,
                }).select("_id name allowedRoles");

                for (const tpl of templates) {
                    const allowedResult = replaceRoleInArray(tpl.allowedRoles);
                    if (!allowedResult.changed) continue;
                    console.log(`  WhatsApp template ${tpl.name || tpl._id}: allowedRoles updated`);
                    summary.templates += 1;
                    if (!isDryRun) {
                        await WhatsAppTemplate.updateOne(
                            { _id: tpl._id },
                            { $set: { allowedRoles: allowedResult.list } }
                        );
                    }
                }
            });
        }

        console.log("\n=== Summary ===");
        console.log(`  Users renamed:              ${summary.users}`);
        console.log(`  Plans updated:              ${summary.plans}`);
        console.log(`  WhatsApp templates updated: ${summary.templates}`);
        console.log(`  Tenant roleAccess maps:     ${summary.tenantsRoleAccess}`);
        if (isDryRun) console.log("  (dry-run — no writes)");
        return summary;
    });
}

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error("MONGODB_URI / MONGO_URI is required");
        process.exit(1);
    }
    await mongoose.connect(uri);
    try {
        await migrateCoachManagerToHeadCoach();
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

module.exports = { migrateCoachManagerToHeadCoach };
