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

const { MODULE_KEYS } = require("../config/featureRegistry");

const DEFAULT_PLANS = [
    {
        key: "basic",
        name: "Basic Plan",
        priceMonthly: 1500,
        priceYearly: 15000,
        currency: "EGP",
        features: ["members", "checkin", "packages", "pt_tracking", ...MODULE_KEYS],
        allowedRoles: ["Owner", "Receptionist", "Coach", "Head Coach"],
        limits: {
            maxMembers: 300,
            maxStaff: 5,
            maxBranches: 1,
        },
        isActive: true,
        visibility: "public",
        sortOrder: 1,
        description: "Core member ops for a single location.",
    },
    {
        key: "gold",
        name: "Gold Plan",
        priceMonthly: 3500,
        priceYearly: 35000,
        currency: "EGP",
        features: [
            "members",
            "checkin",
            "packages",
            "pt_tracking",
            "accounting",
            "exception_approvals",
            "sales_crm",
            "whatsapp",
            "excel_import",
            "funnels",
            "multi_branches",
            "inbox",
            ...MODULE_KEYS,
        ],
        allowedRoles: [
            "Owner",
            "Receptionist",
            "Coach",
            "Head Coach",
            "Accountant",
            "Sales Manager",
            "Sales",
            "General Manager",
        ],
        limits: {
            maxMembers: 1000,
            maxStaff: 15,
            maxBranches: 2,
        },
        isActive: true,
        visibility: "public",
        sortOrder: 2,
        featured: true,
        description: "Sales CRM, WhatsApp, and accounting for growing gyms.",
    },
    {
        key: "platinum",
        name: "Platinum Plan",
        priceMonthly: 6500,
        priceYearly: 65000,
        currency: "EGP",
        features: [
            "members",
            "checkin",
            "packages",
            "pt_tracking",
            "accounting",
            "exception_approvals",
            "sales_crm",
            "whatsapp",
            "excel_import",
            "exec_analytics",
            "funnels",
            "business_intelligence",
            "multi_branches",
            "inbox",
            ...MODULE_KEYS,
        ],
        allowedRoles: [
            "Owner",
            "Receptionist",
            "Coach",
            "Head Coach",
            "Accountant",
            "Sales Manager",
            "Sales",
            "General Manager",
        ],
        limits: {
            maxMembers: 5000,
            maxStaff: 50,
            maxBranches: 10,
        },
        isActive: true,
        visibility: "public",
        sortOrder: 3,
        description: "Full analytics and BI for multi-location operators.",
    },
];

async function seedPlans(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    console.log(`\n=== Seeding Plans ${isDryRun ? "[DRY RUN]" : "[LIVE]"} ===\n`);

    const Plan = require("../models/Plan");
    const results = [];

    for (const planDef of DEFAULT_PLANS) {
        console.log(`Plan [${planDef.key.toUpperCase()}]: ${planDef.name} (${planDef.priceMonthly} ${planDef.currency}/mo)`);
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

/**
 * Fill empty descriptions on the default plans without touching anything an
 * operator has already written. Safe to run on every boot.
 */
async function backfillPlanDescriptions() {
    const Plan = require("../models/Plan");
    let updated = 0;
    for (const planDef of DEFAULT_PLANS) {
        if (!planDef.description) continue;
        const result = await Plan.updateOne(
            { key: planDef.key, $or: [{ description: null }, { description: "" }, { description: { $exists: false } }] },
            { $set: { description: planDef.description } }
        );
        updated += result.modifiedCount || 0;
    }
    return updated;
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

module.exports = { seedPlans, backfillPlanDescriptions, DEFAULT_PLANS };
