const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const {
    passwordResetEmail,
    inviteEmail,
    paymentRejectedEmail,
    accountSuspendedEmail,
    trialEndingEmail,
    paymentReminderEmail,
    paymentOverdueEmail,
    ownerDigestEmail,
    campaignEmail,
} = require("./emailTemplates");

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const LOGO_NAME = "forma-logo.png";
const LOGO_CID = `cid:${LOGO_NAME}`;
const LOGO_PATH = path.resolve(__dirname, "../../../Frontend/public/forma-favicon.png");
const BREVO_TIMEOUT_MS = Number(process.env.BREVO_TIMEOUT_MS) || 15000;
const BREVO_FAIL_THRESHOLD = Number(process.env.BREVO_FAIL_THRESHOLD) || 5;
const BREVO_COOLDOWN_MS = Number(process.env.BREVO_COOLDOWN_MS) || 60000;

let logoContent;
let consecutiveFailures = 0;
let degradedUntil = 0;

function logoAttachment() {
    if (!logoContent) {
        logoContent = fs.readFileSync(LOGO_PATH).toString("base64");
    }
    return { name: LOGO_NAME, content: logoContent };
}

function parseAddress(raw) {
    if (!raw) return null;
    const value = String(raw).trim();
    const bracketed = value.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
    if (bracketed) {
        const name = bracketed[1].trim();
        const email = bracketed[2].trim();
        if (!email) return null;
        return name ? { name, email } : { email };
    }
    if (!value.includes("@") || /\s/.test(value)) return null;
    return { email: value };
}

function defaultFrom() {
    return parseAddress(process.env.MAIL_FROM);
}

function securityFrom() {
    return parseAddress(process.env.MAIL_FROM_SECURITY) || defaultFrom();
}

function isConfigured() {
    return Boolean(process.env.BREVO_API_KEY && defaultFrom());
}

function canSend(sender) {
    return Boolean(process.env.BREVO_API_KEY && sender?.email);
}

function brevoErrorMessage(status, body) {
    let detail = "";
    try {
        const data = JSON.parse(body);
        const message = typeof data.message === "string" ? data.message.trim() : "";
        if (message && message.length <= 200 && !/https?:\/\//i.test(message)) {
            detail = `: ${message}`;
        }
    } catch {
        // Response was not JSON. Keep the status only so a reset URL cannot leak.
    }
    return `Brevo send failed (${status})${detail}`;
}

/**
 * Send mail when Brevo is configured. When it is not, log and return skipped
 * so onboarding and billing still succeed.
 */
async function sendMail({ to, subject, text, html, from }) {
    if (!to) return { skipped: true, reason: "missing_recipient" };
    const sender = from || defaultFrom();
    if (!canSend(sender)) {
        logger.info("mail", "Brevo not configured; email skipped", { to, subject });
        return { skipped: true, reason: "brevo_unconfigured" };
    }

    if (Date.now() < degradedUntil) {
        logger.warn("mail", "Brevo temporarily degraded; email skipped", { to, subject });
        return { skipped: true, reason: "brevo_degraded" };
    }

    let response;
    try {
        response = await fetch(BREVO_URL, {
            method: "POST",
            headers: {
                "api-key": process.env.BREVO_API_KEY,
                "content-type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify({
                sender,
                to: [{ email: to }],
                subject,
                htmlContent: html,
                textContent: text,
                ...(html && html.includes(LOGO_CID) ? { attachment: [logoAttachment()] } : {}),
            }),
            signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
        });
    } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= BREVO_FAIL_THRESHOLD) {
            degradedUntil = Date.now() + BREVO_COOLDOWN_MS;
            consecutiveFailures = 0;
            logger.warn("mail", "Brevo marked degraded after consecutive failures", {
                cooldownMs: BREVO_COOLDOWN_MS,
                error: error.message,
            });
        }
        throw error;
    }

    if (!response.ok) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= BREVO_FAIL_THRESHOLD) {
            degradedUntil = Date.now() + BREVO_COOLDOWN_MS;
            consecutiveFailures = 0;
        }
        const body = await response.text();
        throw new Error(brevoErrorMessage(response.status, body));
    }

    consecutiveFailures = 0;
    return { skipped: false };
}

async function sendInvite({ to, name, gymName, setupUrl }) {
    const content = inviteEmail({ name, gymName, setupUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendPasswordReset({ to, name, setupUrl }) {
    const content = passwordResetEmail({ name, setupUrl });
    return sendMail({ to, ...content, from: securityFrom() });
}

async function sendPaymentRejected({ to, name, gymName, reason, appUrl }) {
    const content = paymentRejectedEmail({ name, gymName, reason, appUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendAccountSuspended({ to, name, gymName, appUrl }) {
    const content = accountSuspendedEmail({ name, gymName, appUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendTrialEnding({ to, name, gymName, daysLeft, appUrl }) {
    const content = trialEndingEmail({ name, gymName, daysLeft, appUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendPaymentReminder({ to, name, gymName, daysLeft, appUrl }) {
    const content = paymentReminderEmail({ name, gymName, daysLeft, appUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendPaymentOverdue({ to, name, gymName, daysUntilSuspension, appUrl }) {
    const content = paymentOverdueEmail({ name, gymName, daysUntilSuspension, appUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendOwnerDigest({ to, name, gymName, periodLabel, metrics, highlights, appUrl }) {
    const content = ownerDigestEmail({ name, gymName, periodLabel, metrics, highlights, appUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendCampaign({ to, name, gymName, subject, message, ctaLabel, ctaUrl }) {
    const content = campaignEmail({ name, gymName, subject, message, ctaLabel, ctaUrl });
    return sendMail({ to, ...content, from: defaultFrom() });
}

async function sendInvoiceEmail({ to, invoiceNumber, html }) {
    const subject = `Invoice ${invoiceNumber}`;
    const text = `Your Forma invoice ${invoiceNumber} is attached in HTML form. Open this email in a browser to view it.`;
    return sendMail({ to, subject, text, html, from: defaultFrom() });
}

/** Snapshot for platform/system health (non-secret). */
function getMailHealth() {
    const degraded = Date.now() < degradedUntil;
    return {
        configured: isConfigured(),
        degraded,
        degradedUntil: degraded ? new Date(degradedUntil).toISOString() : null,
        consecutiveFailures,
    };
}

module.exports = {
    isConfigured,
    getMailHealth,
    sendMail,
    sendInvite,
    sendPasswordReset,
    sendPaymentRejected,
    sendAccountSuspended,
    sendTrialEnding,
    sendPaymentReminder,
    sendPaymentOverdue,
    sendOwnerDigest,
    sendCampaign,
    sendInvoiceEmail,
};
