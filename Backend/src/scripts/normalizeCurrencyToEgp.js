/**
 * Rewrite stored plan, price, coupon, invoice, payment, tenant, and ledger
 * currency codes to EGP. Amounts are left unchanged.
 *
 * BillingEvent is append-only at the Mongoose layer, so the ledger is updated
 * through the raw collection.
 *
 * Usage:
 *   node src/scripts/normalizeCurrencyToEgp.js [--dry-run]
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const { BILLING_CURRENCY } = require("../config/currency");
const Plan = require("../models/Plan");
const PlanPrice = require("../models/PlanPrice");
const Coupon = require("../models/Coupon");
const Invoice = require("../models/Invoice");
const ManualPayment = require("../models/ManualPayment");
const Tenant = require("../models/Tenant");
const BillingEvent = require("../models/BillingEvent");

async function normalizeCurrencyToEgp(options = {}) {
    const isDryRun = options.isDryRun || process.argv.includes("--dry-run");
    const currencySet = { $set: { currency: BILLING_CURRENCY } };
    const notEgp = { currency: { $ne: BILLING_CURRENCY } };

    const models = [
        ["Plan", Plan],
        ["PlanPrice", PlanPrice],
        ["Coupon", Coupon],
        ["Invoice", Invoice],
        ["ManualPayment", ManualPayment],
    ];

    const summary = [];
    for (const [name, Model] of models) {
        const count = await Model.countDocuments(notEgp);
        summary.push({ name, count });
        console.log(`${name}: ${count} document(s) not in ${BILLING_CURRENCY}`);
        if (!isDryRun && count > 0) {
            await Model.updateMany(notEgp, currencySet);
        }
    }

    const tenantFilter = {
        $or: [
            { "settings.locale.currency": { $ne: BILLING_CURRENCY } },
            { "billing.lifetime.currency": { $ne: BILLING_CURRENCY } },
            { "billing.lifetime.priceSnapshot.currency": { $nin: [null, BILLING_CURRENCY] } },
        ],
    };
    const tenantCount = await Tenant.countDocuments(tenantFilter);
    summary.push({ name: "Tenant", count: tenantCount });
    console.log(`Tenant: ${tenantCount} document(s) with a non-${BILLING_CURRENCY} currency`);
    if (!isDryRun && tenantCount > 0) {
        await Tenant.updateMany(
            {},
            {
                $set: {
                    "settings.locale.currency": BILLING_CURRENCY,
                    "billing.lifetime.currency": BILLING_CURRENCY,
                },
            }
        );
        await Tenant.updateMany(
            { "billing.lifetime.priceSnapshot.currency": { $exists: true, $ne: null } },
            { $set: { "billing.lifetime.priceSnapshot.currency": BILLING_CURRENCY } }
        );
    }

    const ledgerCount = await BillingEvent.collection.countDocuments(notEgp);
    summary.push({ name: "BillingEvent", count: ledgerCount });
    console.log(`BillingEvent: ${ledgerCount} ledger row(s) not in ${BILLING_CURRENCY}`);
    if (!isDryRun && ledgerCount > 0) {
        await BillingEvent.collection.updateMany(notEgp, currencySet);
    }

    console.log(isDryRun ? "\nDry run only. No documents were modified.\n" : "\nCurrency normalization complete.\n");
    return summary;
}

if (require.main === module) {
    const connectDB = require("../config/db");
    connectDB().then(async () => {
        try {
            await normalizeCurrencyToEgp();
            await mongoose.disconnect();
            process.exit(0);
        } catch (err) {
            console.error("Currency normalization failed:", err);
            process.exit(1);
        }
    });
}

module.exports = { normalizeCurrencyToEgp };
