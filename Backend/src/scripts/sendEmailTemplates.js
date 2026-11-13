/**
 * Send every transactional template to one inbox for visual review.
 *
 *   node src/scripts/sendEmailTemplates.js
 *   node src/scripts/sendEmailTemplates.js someone@example.com
 *
 * Requires BREVO_API_KEY, MAIL_FROM, and MAIL_FROM_SECURITY in Backend/.env.
 * Links in the messages are previews; they are not live reset tokens.
 */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const mailer = require("../services/mailer");
const { renderInvoiceHtml } = require("../services/invoiceService");
const { campaignStarter } = require("../services/emailTemplates");

const DEFAULT_TO = "ahmedmostafa.swe1@gmail.com";

function previewOrigin() {
    return (process.env.FRONTEND_ORIGIN || "https://app.forma-official.com")
        .split(",")[0]
        .trim()
        .replace(/\/+$/, "");
}

function sampleInvoice() {
    return {
        invoiceNumber: "INV-2026-0001",
        status: "paid",
        issuedAt: new Date(),
        planKey: "growth",
        cycle: "yearly",
        amount: 12000,
        currency: "EGP",
        paymentMethod: "manual_transfer",
        paymentRef: "PREVIEW-REF",
        sellerDetails: {
            name: "Forma",
            taxId: "EG-TAX-10293847",
            address: "Zamalek, Cairo, Egypt",
            supportEmail: "billing@forma-official.com",
        },
        buyerDetails: {
            tenantName: "North Gym",
            tenantSlug: "north-gym",
            ownerName: "Ahmed",
            ownerEmail: DEFAULT_TO,
        },
    };
}

async function main() {
    const to = (process.argv[2] || DEFAULT_TO).trim();
    if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) {
        console.error("BREVO_API_KEY and MAIL_FROM are required");
        process.exit(1);
    }

    const appUrl = previewOrigin();
    const setupUrl = `${appUrl}/auth/setup-password?token=preview`;
    const invoice = sampleInvoice();
    const starters = ["product_update", "offer", "win_back"].map((key) => campaignStarter(key, {
        appUrl,
        offerUrl: process.env.PAYMENT_GATEWAY_URL || appUrl,
    }));
    const jobs = [
        ["password reset", () => mailer.sendPasswordReset({
            to,
            name: "Ahmed",
            setupUrl,
        })],
        ["gym invite", () => mailer.sendInvite({
            to,
            name: "Ahmed",
            gymName: "North Gym",
            setupUrl,
        })],
        ["payment rejected", () => mailer.sendPaymentRejected({
            to,
            name: "Ahmed",
            gymName: "North Gym",
            reason: "The transfer reference did not match.",
            appUrl,
        })],
        ["account suspended", () => mailer.sendAccountSuspended({
            to,
            name: "Ahmed",
            gymName: "North Gym",
            appUrl,
        })],
        ["trial ending", () => mailer.sendTrialEnding({
            to,
            name: "Ahmed",
            gymName: "North Gym",
            daysLeft: 3,
            appUrl,
        })],
        ["payment reminder", () => mailer.sendPaymentReminder({
            to,
            name: "Ahmed",
            gymName: "North Gym",
            daysLeft: 1,
            appUrl,
        })],
        ...starters.map((starter) => [starter.label, () => mailer.sendCampaign({
            to,
            name: "Ahmed",
            gymName: "North Gym",
            subject: starter.subject,
            message: starter.message,
            ctaLabel: starter.ctaLabel,
            ctaUrl: starter.ctaUrl,
        })]),
        ["invoice", () => mailer.sendInvoiceEmail({
            to,
            invoiceNumber: invoice.invoiceNumber,
            html: renderInvoiceHtml(invoice),
        })],
    ];

    let failed = false;
    for (const [label, send] of jobs) {
        try {
            const result = await send();
            if (result.skipped) {
                failed = true;
                console.error(`${label}: skipped (${result.reason})`);
                continue;
            }
            console.log(`${label}: sent to ${to}`);
        } catch (error) {
            failed = true;
            console.error(`${label}: ${error.message}`);
        }
    }

    if (failed) process.exit(1);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
