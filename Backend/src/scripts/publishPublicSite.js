/**
 * Set public_site.published via Mongo (platform setting).
 *
 *   node src/scripts/publishPublicSite.js
 *   node src/scripts/publishPublicSite.js --unpublish
 *
 * Requires MONGO_URI in Backend/.env (or env).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const publicSiteService = require("../services/publicSiteService");

async function main() {
    const unpublish = process.argv.includes("--unpublish");
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("MONGO_URI is required");
        process.exit(1);
    }

    await mongoose.connect(uri);
    const value = await publicSiteService.setPublicSiteSetting({
        published: !unpublish,
        message: unpublish
            ? "Forma’s public site is under development. Check back soon."
            : "Forma public marketing is live.",
        actor: { email: "seo-launch-script@forma-official.com", id: null },
    });

    console.log("public_site updated:", value);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
