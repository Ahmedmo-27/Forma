/**
 * Seed PlanPrices (monthly and yearly only).
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

async function seedPlanPrices(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Seeding Plan Prices ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const plans = await Plan.find();
    if (!plans || plans.length === 0) {
        throw new Error("No plans found in database. Run seedPlans first.");
    }

    const pricesToSeed = [];

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
        });
    }

    const results = [];
    for (const p of pricesToSeed) {
        console.log(`PlanPrice [${p.planKey.toUpperCase()} - ${p.cycle.toUpperCase()}]: ${p.amount} ${p.currency}`);
        if (!isDryRun) {
            const price = await PlanPrice.findOneAndUpdate(
                { planId: p.planId, cycle: p.cycle },
                {
                    $set: {
                        amount: p.amount,
                        currency: p.currency,
                        isActive: p.isActive,
                    },
                    $setOnInsert: {
                        validFrom: p.validFrom,
                        validUntil: p.validUntil,
                        soldLifetimeSeats: 0,
                        maxLifetimeSeats: null,
                    },
                },
                { new: true, upsert: true }
            );
            results.push(price);
        } else {
            results.push(p);
        }
    }

    if (!isDryRun) {
        const deactivated = await PlanPrice.updateMany(
            { cycle: "lifetime", isActive: true },
            { $set: { isActive: false } }
        );
        if (deactivated.modifiedCount) {
            console.log(`Deactivated ${deactivated.modifiedCount} legacy lifetime plan price(s).`);
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
