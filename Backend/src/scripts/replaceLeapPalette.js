/**
 * Replace the old purple Leap starter palette with Forma navy and cream.
 * Gyms that already saved a different palette are left alone.
 *
 * Usage: node src/scripts/replaceLeapPalette.js
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { runAsPlatform } = require("../context/tenantContext");
const { SHOWCASE_PALETTE } = require("../utils/showcasePalette");
const { invalidateTenantCache } = require("../utils/cacheInvalidator");

const STARTER = new Set(["#44298c", "#1e1535", "#5b38ba", "#6d47cc", "#160f2a", "#f4f5f7"]);

function isStarterPalette(palette) {
    if (!palette || typeof palette !== "object") return true;
    const primary = String(palette.primary || "").trim().toLowerCase();
    const navbar = String(palette.navbar || "").trim().toLowerCase();
    if (!primary && !navbar) return true;
    return STARTER.has(primary) || STARTER.has(navbar);
}

async function replaceLeapPalette() {
    await connectDB();
    const Tenant = require("../models/Tenant");
    const tenants = await runAsPlatform(() => Tenant.find({ isSoftDeleted: { $ne: true } }));
    let updated = 0;

    for (const tenant of tenants) {
        const palette = tenant.settings?.branding?.palette;
        const showcase = tenant.purpose === "showcase";
        if (!showcase && !isStarterPalette(palette)) {
            console.log(`kept ${tenant.slug}: custom palette ${palette?.primary || ""}`);
            continue;
        }
        if (!tenant.settings) tenant.settings = {};
        if (!tenant.settings.branding) tenant.settings.branding = {};
        tenant.settings.branding.palette = { ...SHOWCASE_PALETTE };
        tenant.markModified("settings.branding");
        tenant.markModified("settings");
        await tenant.save();
        invalidateTenantCache(tenant._id, "tenant");
        updated += 1;
        console.log(`updated ${tenant.slug} (${tenant.purpose || "customer"})`);
    }

    console.log(`\n${updated} tenant palette${updated === 1 ? "" : "s"} now use Forma navy and cream.`);
    await mongoose.disconnect();
}

if (require.main === module) {
    replaceLeapPalette().catch((err) => {
        console.error("Palette replace failed:", err);
        process.exit(1);
    });
}

module.exports = { replaceLeapPalette, isStarterPalette };
