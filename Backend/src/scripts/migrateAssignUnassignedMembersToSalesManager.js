/**
 * Migration Script: Assign Unassigned Members to Sales Manager
 *
 * Purpose:
 *   Finds all members in the system that do not currently have an assigned sales representative
 *   (assignedSales is null or undefined) and assigns them to the Sales Manager.
 *
 * Multi-Tenancy Architecture:
 *   - Iterates across all tenants using `runWithTenant` to preserve strict tenant data isolation.
 *   - Supports targeting a single tenant via `--tenant=<slug|id>`.
 *   - Identifies the primary Sales Manager for each tenant (oldest by createdAt, _id).
 *   - Supports assigning to an explicit Sales Manager via `--managerId=<id>` or `--managerEmail=<email>`.
 *   - Automatically evicts cached member lists via `invalidateTenantCache` upon successful assignment.
 *   - Resilient fallback for standalone/single-tenant databases when no tenants are configured.
 *   - Idempotent and safe to run multiple times.
 *
 * Usage:
 *   node src/scripts/migrateAssignUnassignedMembersToSalesManager.js [--dry-run]
 *   node src/scripts/migrateAssignUnassignedMembersToSalesManager.js --tenant=leap [--dry-run]
 *   node src/scripts/migrateAssignUnassignedMembersToSalesManager.js --managerEmail=sales.manager@test.com
 *   npm run migrate:assign-sales-manager -- [--dry-run]
 */

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const Tenant = require("../models/Tenant");
const Member = require("../models/Member");
const { runAsPlatform, runWithTenant } = require("../context/tenantContext");
const { assignOpenMembersToSalesManager } = require("../utils/salesAssignment");
const cacheInvalidator = require("../utils/cacheInvalidator");

/**
 * Parse CLI arguments into options object.
 */
function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        isDryRun: false,
        tenant: null,
        managerId: null,
        managerEmail: null,
        help: false,
    };

    for (const arg of argv) {
        if (arg === "--dry-run") {
            options.isDryRun = true;
        } else if (arg.startsWith("--tenant=")) {
            options.tenant = arg.slice("--tenant=".length).trim();
        } else if (arg.startsWith("--managerId=")) {
            options.managerId = arg.slice("--managerId=".length).trim();
        } else if (arg.startsWith("--managerEmail=")) {
            options.managerEmail = arg.slice("--managerEmail=".length).trim();
        } else if (arg === "--help" || arg === "-h") {
            options.help = true;
        }
    }

    return options;
}

function printHelp() {
    console.log(`
Assign Unassigned Members to Sales Manager - Migration Tool

Usage:
  node src/scripts/migrateAssignUnassignedMembersToSalesManager.js [options]

Options:
  --dry-run                 Simulate the migration without modifying documents
  --tenant=<slug|id>        Scope execution to a specific tenant (by slug or ObjectId)
  --managerId=<id>          Explicitly assign to a specific Sales Manager user ID
  --managerEmail=<email>    Explicitly assign to a specific Sales Manager user email
  --help, -h                Show this help message

Examples:
  node src/scripts/migrateAssignUnassignedMembersToSalesManager.js --dry-run
  node src/scripts/migrateAssignUnassignedMembersToSalesManager.js --tenant=leap
  node src/scripts/migrateAssignUnassignedMembersToSalesManager.js --managerEmail=manager@gym.com
`);
}

/**
 * Execute the migration across one or all tenants.
 *
 * @param {Object} [options]
 * @param {boolean} [options.isDryRun]
 * @param {string}  [options.tenant]       - Tenant slug or ObjectId
 * @param {string}  [options.managerId]    - Explicit sales manager user ObjectId
 * @param {string}  [options.managerEmail] - Explicit sales manager email
 * @returns {Promise<{
 *   totalTenants: number,
 *   migratedTenants: number,
 *   skippedTenants: number,
 *   totalAssigned: number,
 *   totalUnassignedRemaining: number,
 *   details: Array<Object>
 * }>}
 */
async function migrateAssignUnassignedMembersToSalesManager(options = {}) {
    const cliOptions = parseArgs();
    const isDryRun = Boolean(options.isDryRun ?? cliOptions.isDryRun);
    const tenantTarget = options.tenant || cliOptions.tenant || null;
    const managerId = options.managerId || cliOptions.managerId || null;
    const managerEmail = options.managerEmail || cliOptions.managerEmail || null;

    console.log(`\n============================================================`);
    console.log(`  MIGRATION: ASSIGN UNASSIGNED MEMBERS TO SALES MANAGER`);
    console.log(`  Mode: ${isDryRun ? "[DRY RUN - SIMULATION ONLY]" : "[LIVE - COMMITTING CHANGES]"}`);
    if (tenantTarget) console.log(`  Target Tenant: ${tenantTarget}`);
    if (managerId)    console.log(`  Explicit Manager ID: ${managerId}`);
    if (managerEmail) console.log(`  Explicit Manager Email: ${managerEmail}`);
    console.log(`============================================================\n`);

    return runAsPlatform(async () => {
        // Step 1: Resolve Tenants
        let tenants = [];
        if (tenantTarget) {
            const isObjectId = mongoose.Types.ObjectId.isValid(tenantTarget);
            const tenantQuery = isObjectId
                ? { $or: [{ _id: tenantTarget }, { slug: tenantTarget }] }
                : { slug: tenantTarget };

            const matched = await Tenant.findOne(tenantQuery).select("_id slug name").lean();
            if (!matched) {
                throw new Error(`Target tenant "${tenantTarget}" could not be found.`);
            }
            tenants = [matched];
        } else {
            tenants = await Tenant.find().select("_id slug name").sort({ createdAt: 1 }).lean();
        }

        const summary = {
            totalTenants: tenants.length,
            migratedTenants: 0,
            skippedTenants: 0,
            totalAssigned: 0,
            totalUnassignedRemaining: 0,
            details: [],
        };

        // Step 2: Handle multi-tenant database
        if (tenants.length > 0) {
            console.log(`Found ${tenants.length} tenant(s) to inspect.\n`);

            for (const tenant of tenants) {
                const tenantContext = {
                    tenantId: String(tenant._id),
                    tenantSlug: tenant.slug,
                };

                const detail = await runWithTenant(tenantContext, async () => {
                    const result = await assignOpenMembersToSalesManager({
                        isDryRun,
                        managerId,
                        managerEmail,
                    });

                    const tenantLabel = `Tenant "${tenant.name}" (${tenant.slug})`;

                    if (result.reason === "NO_SALES_MANAGER") {
                        console.warn(
                            `  [WARN] ${tenantLabel}: Found ${result.unassignedCount} unassigned member(s), ` +
                            `but no user with role "Sales Manager" exists. Skipping.`
                        );
                        return {
                            tenantId: tenant._id,
                            tenantSlug: tenant.slug,
                            tenantName: tenant.name,
                            status: "SKIPPED_NO_MANAGER",
                            unassignedFound: result.unassignedCount,
                            assignedCount: 0,
                            manager: null,
                        };
                    }

                    const managerDesc = result.manager
                        ? `"${result.manager.name}" (${result.manager.email || result.manager._id})`
                        : "Sales Manager";

                    if (result.unassignedCount === 0) {
                        console.log(`  [SKIP] ${tenantLabel}: All members are already assigned.`);
                        return {
                            tenantId: tenant._id,
                            tenantSlug: tenant.slug,
                            tenantName: tenant.name,
                            status: "ALREADY_ASSIGNED",
                            unassignedFound: 0,
                            assignedCount: 0,
                            manager: result.manager?.name || null,
                        };
                    }

                    if (isDryRun) {
                        console.log(
                            `  [DRY RUN] ${tenantLabel}: Would assign ${result.unassignedCount} ` +
                            `member(s) to ${managerDesc}.`
                        );
                        return {
                            tenantId: tenant._id,
                            tenantSlug: tenant.slug,
                            tenantName: tenant.name,
                            status: "DRY_RUN",
                            unassignedFound: result.unassignedCount,
                            assignedCount: result.unassignedCount,
                            manager: result.manager?.name || null,
                        };
                    }

                    // Live execution
                    cacheInvalidator.invalidateTenantCache(tenant._id, "members");
                    console.log(
                        `  [OK] ${tenantLabel}: Successfully assigned ${result.updated} ` +
                        `member(s) to ${managerDesc}.`
                    );

                    return {
                        tenantId: tenant._id,
                        tenantSlug: tenant.slug,
                        tenantName: tenant.name,
                        status: "MIGRATED",
                        unassignedFound: result.unassignedCount,
                        assignedCount: result.updated,
                        manager: result.manager?.name || null,
                    };
                });

                summary.details.push(detail);
                if (detail.status === "MIGRATED" || detail.status === "DRY_RUN") {
                    summary.migratedTenants++;
                    summary.totalAssigned += detail.assignedCount;
                } else {
                    summary.skippedTenants++;
                    if (detail.status === "SKIPPED_NO_MANAGER") {
                        summary.totalUnassignedRemaining += detail.unassignedFound;
                    }
                }
            }
        } else {
            // Standalone / single-tenant legacy database fallback
            console.log("No Tenant records found; running in standalone database mode.\n");
            const result = await assignOpenMembersToSalesManager({
                isDryRun,
                managerId,
                managerEmail,
            });

            if (result.reason === "NO_SALES_MANAGER") {
                console.warn(
                    `  [WARN] Standalone DB: Found ${result.unassignedCount} unassigned member(s), ` +
                    `but no user with role "Sales Manager" exists. Skipping.`
                );
                summary.skippedTenants++;
                summary.totalUnassignedRemaining += result.unassignedCount;
                summary.details.push({
                    tenantId: null,
                    tenantSlug: "standalone",
                    tenantName: "Standalone",
                    status: "SKIPPED_NO_MANAGER",
                    unassignedFound: result.unassignedCount,
                    assignedCount: 0,
                    manager: null,
                });
            } else if (result.unassignedCount === 0) {
                console.log(`  [SKIP] Standalone DB: All members are already assigned.`);
                summary.skippedTenants++;
                summary.details.push({
                    tenantId: null,
                    tenantSlug: "standalone",
                    tenantName: "Standalone",
                    status: "ALREADY_ASSIGNED",
                    unassignedFound: 0,
                    assignedCount: 0,
                    manager: result.manager?.name || null,
                });
            } else {
                const managerDesc = result.manager
                    ? `"${result.manager.name}" (${result.manager.email || result.manager._id})`
                    : "Sales Manager";

                if (isDryRun) {
                    console.log(`  [DRY RUN] Standalone DB: Would assign ${result.unassignedCount} member(s) to ${managerDesc}.`);
                    summary.migratedTenants++;
                    summary.totalAssigned += result.unassignedCount;
                    summary.details.push({
                        tenantId: null,
                        tenantSlug: "standalone",
                        tenantName: "Standalone",
                        status: "DRY_RUN",
                        unassignedFound: result.unassignedCount,
                        assignedCount: result.unassignedCount,
                        manager: result.manager?.name || null,
                    });
                } else {
                    console.log(`  [OK] Standalone DB: Successfully assigned ${result.updated} member(s) to ${managerDesc}.`);
                    summary.migratedTenants++;
                    summary.totalAssigned += result.updated;
                    summary.details.push({
                        tenantId: null,
                        tenantSlug: "standalone",
                        tenantName: "Standalone",
                        status: "MIGRATED",
                        unassignedFound: result.unassignedCount,
                        assignedCount: result.updated,
                        manager: result.manager?.name || null,
                    });
                }
            }
        }

        // Step 3: Verification Check
        console.log("\n--- Verification Check ---");
        if (!isDryRun) {
            let totalRemaining = 0;
            if (tenants.length > 0) {
                for (const detail of summary.details) {
                    if (detail.status === "MIGRATED") {
                        const remaining = await runWithTenant(
                            { tenantId: String(detail.tenantId), tenantSlug: detail.tenantSlug },
                            () => Member.countDocuments({
                                $or: [{ assignedSales: null }, { assignedSales: { $exists: false } }],
                            })
                        );
                        if (remaining > 0) {
                            console.error(`  [FAIL] Tenant "${detail.tenantName}": ${remaining} unassigned member(s) still remain!`);
                            totalRemaining += remaining;
                        }
                    }
                }
            } else {
                const remaining = await Member.countDocuments({
                    $or: [{ assignedSales: null }, { assignedSales: { $exists: false } }],
                });
                totalRemaining += remaining;
            }

            if (totalRemaining === 0) {
                console.log("  [PASSED] 100% of unassigned members in migrated gyms are now assigned.");
            } else {
                console.error(`  [WARNING] Verification detected ${totalRemaining} unassigned member(s) remaining.`);
            }
        } else {
            console.log("  [DRY RUN] Verification step skipped in simulation mode.");
        }

        // Step 4: Summary Output
        console.log(`\n============================================================`);
        console.log(`  MIGRATION SUMMARY`);
        console.log(`  Tenants Inspected:       ${summary.totalTenants}`);
        console.log(`  Tenants Migrated:        ${summary.migratedTenants}`);
        console.log(`  Tenants Skipped:         ${summary.skippedTenants}`);
        console.log(`  Total Members Assigned:  ${summary.totalAssigned}`);
        if (summary.totalUnassignedRemaining > 0) {
            console.log(`  Unassigned Remaining:    ${summary.totalUnassignedRemaining} (Action Required: Add Sales Manager)`);
        }
        console.log(`============================================================\n`);

        return summary;
    }, { reason: "migrate_assign_unassigned_members_to_sales_manager" });
}

// Direct CLI invocation
if (require.main === module) {
    const cliOptions = parseArgs();
    if (cliOptions.help) {
        printHelp();
        process.exit(0);
    }

    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await migrateAssignUnassignedMembersToSalesManager();
            await mongoose.disconnect();
            process.exit(0);
        } catch (err) {
            console.error("\n[FATAL] Migration failed:", err.message);
            try {
                await mongoose.disconnect();
            } catch (_) {}
            process.exit(1);
        }
    });
}

module.exports = {
    migrateAssignUnassignedMembersToSalesManager,
    parseArgs,
};
