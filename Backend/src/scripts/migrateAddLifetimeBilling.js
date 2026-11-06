/**
 * Migration: add-lifetime-billing
 *
 * 1. Seeds PlanPrice collection with monthly, yearly, and lifetime placeholders.
 * 2. Ensures BillingEvent and PlanPrice indexes.
 * 3. Migrates founding tenant ("leap") into the Platinum Lifetime plan with a founding BillingEvent.
 * 4. Backfills billing.cycle ("monthly") for all other existing tenants.
 * 5. Strict verification step: fails if any tenant lacks billing.cycle.
 *
 * Usage:
 *   node src/scripts/migrateAddLifetimeBilling.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const Plan = require("../models/Plan");
const Tenant = require("../models/Tenant");
const PlanPrice = require("../models/PlanPrice");
const BillingEvent = require("../models/BillingEvent");
const AuditLog = require("../models/AuditLog");
const { seedPlanPrices } = require("./seedPlanPrices");
const { runAsPlatform } = require("../context/tenantContext");

async function migrateAddLifetimeBilling(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");

    console.log(`\n============================================================`);
    console.log(`  MIGRATION: ADD LIFETIME BILLING ${isDryRun ? "[DRY RUN]" : "[LIVE]"}`);
    console.log(`============================================================\n`);

    return runAsPlatform(async () => {
        // Step 1: Ensure Plan Prices are seeded
        console.log("--- Step 1: Seeding / Updating PlanPrices ---");
        const seededPrices = await seedPlanPrices({ isDryRun });
        console.log(`  [OK] Processed ${seededPrices.length} plan prices.`);

        // Step 2: Ensure Indexes
        console.log("\n--- Step 2: Ensuring Indexes on PlanPrice & BillingEvent ---");
        if (!isDryRun) {
            await PlanPrice.syncIndexes();
            await BillingEvent.syncIndexes();
            console.log("  [OK] Indexes synchronized successfully.");
        } else {
            console.log("  [DRY RUN] Would sync indexes on PlanPrice and BillingEvent.");
        }

        // Step 3: Find Platinum Plan for founding tenant
        const platinumPlan = await Plan.findOne({ key: "platinum" });
        if (!platinumPlan && !isDryRun) {
            throw new Error("Platinum plan not found. Run seedPlans first.");
        }

        // Step 4: Backfill Tenants
        console.log("\n--- Step 3: Backfilling Tenants & Migrating Leap to Lifetime ---");
        const tenants = await Tenant.find();
        console.log(`  Found ${tenants.length} total tenants to inspect.`);

        let leapMigrated = 0;
        let standardBackfilled = 0;
        let alreadyConfigured = 0;

        for (const tenant of tenants) {
            if (tenant.slug === "leap") {
                // User requirement: Migrate Leap Gym into the Platinum Lifetime plan
                if (tenant.billing?.cycle === "lifetime" && tenant.planId?.toString() === platinumPlan?._id?.toString()) {
                    console.log(`  [SKIP] Leap Gym already on Platinum Lifetime.`);
                    alreadyConfigured++;
                    continue;
                }

                console.log(`  [MIGRATE] Migrating Leap Gym (${tenant._id}) to Platinum Lifetime...`);
                if (!isDryRun) {
                    const now = new Date();
                    tenant.planId = platinumPlan._id;
                    tenant.status = "active";
                    tenant.currentPeriodEnd = null;
                    tenant.trialEndsAt = null;
                    tenant.billing = {
                        cycle: "lifetime",
                        lifetime: {
                            purchasedAt: now,
                            amountPaid: 0,
                            currency: "EGP",
                            paymentMethod: "manual_transfer",
                            paymentRef: "FOUNDING-LEAP-LIFETIME",
                            entitlementPolicy: "follow_tier",
                            featureSnapshot: [],
                            lifetimeTermsVersion: "2026.1 founding",
                            refundWindowEndsAt: null,
                            revokedAt: null,
                            revokeReason: null,
                            fairUseLimits: {
                                storageGbLimit: 100,
                                whatsappMessagesMonthlyLimit: 10000,
                            },
                        },
                    };
                    await tenant.save();

                    // Insert founding BillingEvent
                    const existingEvent = await BillingEvent.findOne({ externalRef: "FOUNDING-LEAP-LIFETIME" });
                    if (!existingEvent) {
                        const actorId = tenant.ownerUserId || new mongoose.Types.ObjectId();
                        await BillingEvent.create({
                            tenantId: tenant._id,
                            type: "manual_grant",
                            planKey: "platinum",
                            cycle: "lifetime",
                            amount: 0,
                            currency: "EGP",
                            actorId,
                            actorType: "system",
                            externalRef: "FOUNDING-LEAP-LIFETIME",
                            meta: { note: "Founding Leap tenant migrated to Platinum Lifetime", termsVersion: "2026.1 founding" },
                        });

                        await AuditLog.create({
                            tenantId: tenant._id,
                            action: "lifetime_granted",
                            actor: actorId,
                            actorRole: "system",
                            targetType: "tenant",
                            targetId: tenant._id.toString(),
                            meta: { reason: "Founding tenant lifetime grant", planKey: "platinum" },
                        });
                    }
                }
                leapMigrated++;
            } else {
                // Standard tenant backfill
                if (!tenant.billing || !tenant.billing.cycle) {
                    console.log(`  [BACKFILL] Backfilling billing.cycle: 'monthly' for ${tenant.name} (${tenant.slug})...`);
                    if (!isDryRun) {
                        tenant.billing = {
                            cycle: "monthly",
                            lifetime: {},
                        };
                        await tenant.save();
                    }
                    standardBackfilled++;
                } else {
                    alreadyConfigured++;
                }
            }
        }

        console.log(`\n  Counts: Leap Migrated: ${leapMigrated}, Backfilled Monthly: ${standardBackfilled}, Already Up-to-date: ${alreadyConfigured}`);

        // Step 5: Strict Verification Step
        console.log("\n--- Step 4: Verification Check ---");
        if (!isDryRun) {
            const missingCycleCount = await Tenant.countDocuments({
                $or: [
                    { billing: { $exists: false } },
                    { "billing.cycle": { $exists: false } },
                    { "billing.cycle": null },
                ],
            });

            if (missingCycleCount > 0) {
                throw new Error(`Verification Failed: ${missingCycleCount} tenants still lack billing.cycle!`);
            }
            console.log("  [PASSED] 100% of tenants have valid billing.cycle defined.");
        } else {
            console.log("  [DRY RUN] Verification step skipped in dry-run mode.");
        }

        console.log(`\n============================================================`);
        console.log(`  MIGRATION COMPLETE`);
        console.log(`============================================================\n`);

        return { leapMigrated, standardBackfilled, alreadyConfigured };
    }, { reason: "migrate_add_lifetime_billing" });
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await migrateAddLifetimeBilling();
            process.exit(0);
        } catch (err) {
            console.error("Migration failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { migrateAddLifetimeBilling };
