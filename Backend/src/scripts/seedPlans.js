/**
 * Seed Default Platform Plans (Basic, Gold, Platinum)
 * Idempotent: upserts plans by key.
 *
 * Usage:
 *   node src/scripts/seedPlans.js [--dry-run]
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DEFAULT_PLANS = [
    {
        key: "basic",
        name: "Basic Plan",
        priceMonthly: 29,
        priceYearly: 290,
        currency: "USD",
        features: ["members", "checkin", "packages", "pt_tracking", "audit"],
        allowedRoles: ["Owner", "Receptionist", "Coach", "Coach Manager"],
        limits: {
            maxMembers: 300,
            maxStaff: 5,
            maxBranches: 1,
        },
        isActive: true,
    },
    {
        key: "gold",
        name: "Gold Plan",
        priceMonthly: 79,
        priceYearly: 790,
        currency: "USD",
        features: [
            "members",
            "checkin",
            "packages",
            "pt_tracking",
            "audit",
            "accounting",
            "exception_approvals",
            "sales_crm",
            "whatsapp",
            "excel_import",
        ],
        allowedRoles: [
            "Owner",
            "Receptionist",
            "Coach",
            "Coach Manager",
            "Accountant",
            "Sales Manager",
            "Sales",
        ],
        limits: {
            maxMembers: 1000,
            maxStaff: 15,
            maxBranches: 2,
        },
        isActive: true,
    },
    {
        key: "platinum",
        name: "Platinum Plan",
        priceMonthly: 149,
        priceYearly: 1490,
        currency: "USD",
        features: [
            "members",
            "checkin",
            "packages",
            "pt_tracking",
            "audit",
            "accounting",
            "exception_approvals",
            "sales_crm",
            "whatsapp",
            "excel_import",
            "exec_analytics",
            "funnels",
            "business_intelligence",
        ],
        allowedRoles: [
            "Owner",
            "Receptionist",
            "Coach",
            "Coach Manager",
            "Accountant",
            "Sales Manager",
            "Sales",
        ],
        limits: {
            maxMembers: 5000,
            maxStaff: 50,
            maxBranches: 10,
        },
        isActive: true,
    },
];

async function seedPlans(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Seeding Plans ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Plan = require("../models/Plan");
    const results = [];

    for (const planDef of DEFAULT_PLANS) {
        console.log(`Plan [${planDef.key.toUpperCase()}]: ${planDef.name} ($${planDef.priceMonthly}/mo)`);
        console.log(`  Features: ${planDef.features.join(", ")}`);
        console.log(`  Allowed Roles: ${planDef.allowedRoles.join(", ")}`);

        if (!isDryRun) {
            const plan = await Plan.findOneAndUpdate(
                { key: planDef.key },
                { $set: planDef },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            results.push(plan);
        } else {
            results.push(planDef);
        }
    }

    console.log(`\nSuccessfully processed ${results.length} plans.\n`);
    return results;
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await seedPlans();
            process.exit(0);
        } catch (err) {
            console.error("Plan seeding failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { seedPlans, DEFAULT_PLANS };
