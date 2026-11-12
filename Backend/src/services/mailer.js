const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

function isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function createTransport() {
    const port = Number(process.env.SMTP_PORT || 587);
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
            : undefined,
    });
}

/**
 * Send mail when SMTP is configured. When it is not, log and return skipped
 * so onboarding and billing still succeed.
 */
async function sendMail({ to, subject, text, html }) {
    if (!to) return { skipped: true, reason: "missing_recipient" };
    if (!isConfigured()) {
        logger.info("mail", "SMTP not configured; email skipped", { to, subject });
        return { skipped: true, reason: "smtp_unconfigured" };
    }

    await createTransport().sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        text,
        html,
    });
    return { skipped: false };
}

async function sendInvite({ to, name, gymName, setupUrl }) {
    const subject = `Set your password for ${gymName}`;
    const text = [
        `Hello ${name || "there"},`,
        "",
        `Your gym workspace "${gymName}" is ready on Forma.`,
        "Set your password using this link (valid for 72 hours):",
        setupUrl,
        "",
        "If you did not expect this email, you can ignore it.",
    ].join("\n");
    const html = `<p>Hello ${escapeHtml(name || "there")},</p>
<p>Your gym workspace <strong>${escapeHtml(gymName)}</strong> is ready on Forma.</p>
<p><a href="${escapeHtml(setupUrl)}">Set your password</a>. This link is valid for 72 hours.</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendPasswordReset({ to, name, setupUrl }) {
    const subject = "Reset your Forma password";
    const text = [
        `Hello ${name || "there"},`,
        "",
        "Use this link to set a new password (valid for 2 hours):",
        setupUrl,
        "",
        "If you did not request a reset, you can ignore this email.",
    ].join("\n");
    const html = `<p>Hello ${escapeHtml(name || "there")},</p>
<p><a href="${escapeHtml(setupUrl)}">Set a new password</a>. This link is valid for 2 hours.</p>
<p>If you did not request a reset, you can ignore this email.</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendInvoiceEmail({ to, invoiceNumber, html }) {
    const subject = `Invoice ${invoiceNumber}`;
    const text = `Your Forma invoice ${invoiceNumber} is attached in HTML form. Open this email in a browser to view it.`;
    return sendMail({ to, subject, text, html });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

module.exports = {
    isConfigured,
    sendMail,
    sendInvite,
    sendPasswordReset,
    sendInvoiceEmail,
};
