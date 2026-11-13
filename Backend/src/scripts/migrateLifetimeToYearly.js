/**
 * Migration: convert lifetime tenants to yearly billing.
 *
 * For every tenant with billing.cycle === "lifetime":
 *   - Sets cycle to "yearly"
 *   - Sets currentPeriodEnd to now + 1 year
 *   - Clears trialEndsAt when status is active
 *   - Archives prior lifetime metadata on a BillingEvent
 *   - If entitlementPolicy was "snapshot", preserves featureSnapshot via featureOverrides.add
 *   - Resets billing.lifetime to an empty subdocument
 *
 * Usage:
 *   node src/scripts/migrateLifetimeToYearly.js [--dry-run]
 *   npm run migrate:lifetime-to-yearly
 *   npm run migrate:lifetime-to-yearly -- --dry-run
 */

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const Tenant = require("../models/Tenant");
const BillingEvent = require("../models/BillingEvent");
const AuditLog = require("../models/AuditLog");
const { BILLING_CURRENCY } = require("../config/currency");
const { runAsPlatform } = require("../context/tenantContext");

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function addOneYear(from = new Date()) {
    return new Date(from.getTime() + ONE_YEAR_MS);
}

async function migrateLifetimeToYearly(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");

    console.log(`\n============================================================`);
    console.log(`  MIGRATION: LIFETIME → YEARLY ${isDryRun ? "[DRY RUN]" : "[LIVE]"}`);
    console.log(`============================================================\n`);

    return runAsPlatform(async () => {
        const tenants = await Tenant.find({ "billing.cycle": "lifetime" }).populate(
            "planId",
            "key name"
        );

        console.log(`Found ${tenants.length} lifetime tenant(s) to convert.\n`);

        if (tenants.length === 0) {
            console.log("Nothing to do.");
            return { migrated: 0, skipped: 0 };
        }

        let migrated = 0;
        let skipped = 0;
        const now = new Date();
        const periodEnd = addOneYear(now);

        for (const tenant of tenants) {
            const planKey = tenant.planId?.key || "basic";
            const previousLifetime = tenant.billing?.lifetime
                ? JSON.parse(JSON.stringify(tenant.billing.lifetime))
                : {};
            const previousPolicy = previousLifetime.entitlementPolicy || "follow_tier";

            console.log(
                `  [${isDryRun ? "WOULD MIGRATE" : "MIGRATE"}] ${tenant.name} (${tenant.slug})` +
                    ` plan=${planKey} policy=${previousPolicy}`
            );

            if (isDryRun) {
                migrated++;
                continue;
            }

            try {
                tenant.billing.cycle = "yearly";
                tenant.currentPeriodEnd = periodEnd;
                if (tenant.status === "active") {
                    tenant.trialEndsAt = null;
                }

                // Preserve frozen features from snapshot lifetime licenses.
                if (
                    previousPolicy === "snapshot" &&
                    Array.isArray(previousLifetime.featureSnapshot) &&
                    previousLifetime.featureSnapshot.length > 0
                ) {
                    const existingAdd = Array.isArray(tenant.featureOverrides?.add)
                        ? tenant.featureOverrides.add
                        : [];
                    const merged = Array.from(
                        new Set([...existingAdd, ...previousLifetime.featureSnapshot])
                    );
                    tenant.featureOverrides = {
                        add: merged,
                        remove: Array.isArray(tenant.featureOverrides?.remove)
                            ? tenant.featureOverrides.remove
                            : [],
                    };
                    tenant.markModified("featureOverrides");
                }

                tenant.billing.lifetime = {};
                tenant.markModified("billing");
                await tenant.save();

                const actorId =
                    tenant.ownerUserId || new mongoose.Types.ObjectId("000000000000000000000001");

                await BillingEvent.create({
                    tenantId: tenant._id,
                    type: "manual_grant",
                    planKey,
                    cycle: "yearly",
                    amount: 0,
                    currency: BILLING_CURRENCY,
                    actorId,
                    actorType: "system",
                    externalRef: `MIGRATE-LIFETIME-TO-YEARLY:${tenant._id}`,
                    meta: {
                        reason: "Migrated lifetime subscription to yearly",
                        previousCycle: "lifetime",
                        previousLifetime,
                        currentPeriodEnd: periodEnd.toISOString(),
                        migratedAt: now.toISOString(),
                    },
                });

                await AuditLog.create({
                    tenantId: tenant._id,
                    action: "plan_updated",
                    actor: actorId,
                    actorRole: "system",
                    targetType: "tenant",
                    targetId: tenant._id.toString(),
                    meta: {
                        reason: "Migrated lifetime subscription to yearly",
                        previousCycle: "lifetime",
                        newCycle: "yearly",
                        currentPeriodEnd: periodEnd.toISOString(),
                        planKey,
                    },
                });

                migrated++;
            } catch (err) {
                skipped++;
                console.error(
                    `  [ERROR] Failed to migrate ${tenant.slug} (${tenant._id}): ${err.message}`
                );
            }
        }

        console.log(`\n--- Verification ---`);
        if (!isDryRun) {
            const remaining = await Tenant.countDocuments({ "billing.cycle": "lifetime" });
            if (remaining > 0) {
                console.warn(`  [WARN] ${remaining} tenant(s) still have billing.cycle === "lifetime".`);
            } else {
                console.log(`  [PASSED] No lifetime tenants remain.`);
            }
        } else {
            console.log(`  [DRY RUN] Verification skipped.`);
        }

        console.log(`\n============================================================`);
        console.log(`  DONE — migrated: ${migrated}, failed: ${skipped}`);
        console.log(`============================================================\n`);

        return { migrated, skipped };
    }, { reason: "migrate_lifetime_to_yearly" });
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await migrateLifetimeToYearly();
            process.exit(0);
        } catch (err) {
            console.error("Migration failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { migrateLifetimeToYearly };
