/**
 * Seed PlanPrices (Monthly, Yearly, Lifetime)
 * Idempotent: upserts prices by { planId, cycle }.
 *
 * Usage:
 *   node src/scripts/seedPlanPrices.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const Plan = require("../models/Plan");
const PlanPrice = require("../models/PlanPrice");
const pricingConfig = require("../config/lifetimePricing.json");

async function seedPlanPrices(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Seeding Plan Prices ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const plans = await Plan.find();
    if (!plans || plans.length === 0) {
        throw new Error("No plans found in database. Run seedPlans first.");
    }

    const planByKey = {};
    plans.forEach((p) => {
        planByKey[p.key] = p;
    });

    const pricesToSeed = [];

    // 1. Monthly & Yearly prices from Plan definitions
    for (const plan of plans) {
        pricesToSeed.push({
            planId: plan._id,
            planKey: plan.key,
            cycle: "monthly",
            amount: plan.priceMonthly,
            currency: plan.currency || "EGP",
            isActive: true,
            validFrom: new Date(),
            validUntil: null,
            maxLifetimeSeats: null,
        });
        pricesToSeed.push({
            planId: plan._id,
            planKey: plan.key,
            cycle: "yearly",
            amount: plan.priceYearly,
            currency: plan.currency || "EGP",
            isActive: true,
            validFrom: new Date(),
            validUntil: null,
            maxLifetimeSeats: null,
        });
    }

    // 2. Lifetime prices from configuration file placeholders
    for (const item of pricingConfig.lifetimePricing || []) {
        const plan = planByKey[item.planKey];
        if (!plan) {
            console.warn(`Warning: Plan '${item.planKey}' not found, skipping lifetime price.`);
            continue;
        }

        pricesToSeed.push({
            planId: plan._id,
            planKey: item.planKey,
            cycle: "lifetime",
            amount: item.amount,
            currency: item.currency || "EGP",
            isActive: item.isActive ?? true,
            validFrom: new Date(),
            validUntil: null,
            maxLifetimeSeats: item.maxLifetimeSeats ?? null,
        });
    }

    const results = [];
    for (const p of pricesToSeed) {
        console.log(`PlanPrice [${p.planKey.toUpperCase()} - ${p.cycle.toUpperCase()}]: ${p.amount} ${p.currency} (Seats cap: ${p.maxLifetimeSeats ?? 'Unlimited'})`);
        if (!isDryRun) {
            const price = await PlanPrice.findOneAndUpdate(
                { planId: p.planId, cycle: p.cycle },
                {
                    $set: {
                        amount: p.amount,
                        currency: p.currency,
                        isActive: p.isActive,
                        maxLifetimeSeats: p.maxLifetimeSeats,
                    },
                    $setOnInsert: {
                        validFrom: p.validFrom,
                        validUntil: p.validUntil,
                        soldLifetimeSeats: 0,
                    },
                },
                { new: true, upsert: true }
            );
            results.push(price);
        } else {
            results.push(p);
        }
    }

    console.log(`\nSuccessfully processed ${results.length} plan prices.\n`);
    return results;
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await seedPlanPrices();
            process.exit(0);
        } catch (err) {
            console.error("PlanPrice seeding failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { seedPlanPrices };
