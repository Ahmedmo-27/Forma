const NAVY = "#142843";
const CREAM = "#FCF3E2";
const WHITE = "#ffffff";
const TEXT = "#3E5168";
const MUTED = "#5C6E84";
const BORDER = "#E6DCC8";

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function oneLine(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function displayName(name) {
    const cleaned = oneLine(name);
    return cleaned || "there";
}

/**
 * Table layout for transactional mail. Colors match the platform tokens:
 * cream canvas, navy wordmark and button, white card.
 */
function paragraphs(text) {
    return String(text || "")
        .split(/\n{2,}/)
        .map((block) => {
            const html = escapeHtml(block.trim()).replace(/\n/g, "<br>");
            return html ? `<p style="margin:0 0 12px;">${html}</p>` : "";
        })
        .join("");
}

function renderTransactionalEmail({ preheader, title, bodyHtml, ctaLabel, ctaUrl, footnote }) {
    const safeUrl = ctaUrl ? escapeHtml(ctaUrl) : "";
    const safeTitle = escapeHtml(title);
    const safeCta = escapeHtml(ctaLabel || "");
    const safePreheader = escapeHtml(preheader);
    const safeFootnote = escapeHtml(footnote);
    const actionRows = safeUrl
        ? `<tr>
          <td style="padding:24px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="${NAVY}" style="border-radius:10px;">
                  <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${CREAM};text-decoration:none;">${safeCta}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">
            Or copy this link into your browser:<br>
            <a href="${safeUrl}" style="color:${NAVY};word-break:break-all;">${safeUrl}</a>
          </td>
        </tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${CREAM};">${safePreheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${WHITE};border:1px solid ${BORDER};border-radius:12px;">
        <tr>
          <td style="padding:28px 32px 0;">
            <img src="cid:forma-logo.png" width="40" height="40" alt="Forma" style="display:block;border:0;border-radius:10px;width:40px;height:40px;">
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:${NAVY};">${safeTitle}</td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEXT};">${bodyHtml}</td>
        </tr>
        ${actionRows}
        <tr>
          <td style="padding:20px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">${safeFootnote}</td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">Forma · gym management</p>
    </td>
  </tr>
</table>
</body>
</html>`;

    return html;
}

function passwordResetEmail({ name, setupUrl }) {
    const who = displayName(name);
    const subject = "Reset your Forma password";
    const text = [
        `Hello ${who},`,
        "",
        "Use this link to set a new password (valid for 2 hours):",
        setupUrl,
        "",
        "If you did not request a reset, you can ignore this email. Your password will stay the same.",
    ].join("\n");
    const html = renderTransactionalEmail({
        preheader: "This link expires in 2 hours.",
        title: "Reset your password",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0;">Use the button below to choose a new password. This link expires in 2 hours.</p>`,
        ctaLabel: "Set a new password",
        ctaUrl: setupUrl,
        footnote: "If you did not request a reset, you can ignore this email. Your password will stay the same.",
    });
    return { subject, text, html };
}

function inviteEmail({ name, gymName, setupUrl }) {
    const who = displayName(name);
    const gym = oneLine(gymName) || "your gym";
    const subject = `Set your password for ${gym}`;
    const text = [
        `Hello ${who},`,
        "",
        `Your gym workspace "${gym}" is ready on Forma.`,
        "Set your password using this link (valid for 72 hours):",
        setupUrl,
        "",
        "If you did not expect this email, you can ignore it.",
    ].join("\n");
    const html = renderTransactionalEmail({
        preheader: "Your gym workspace is ready on Forma.",
        title: "Your workspace is ready",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0;">Your gym workspace <strong style="color:${NAVY};">${escapeHtml(gym)}</strong> is ready on Forma. Set your password with the button below. This link is valid for 72 hours.</p>`,
        ctaLabel: "Set your password",
        ctaUrl: setupUrl,
        footnote: "If you did not expect this email, you can ignore it.",
    });
    return { subject, text, html };
}

function paymentRejectedEmail({ name, gymName, reason, appUrl }) {
    const who = displayName(name);
    const gym = oneLine(gymName) || "your gym";
    const why = oneLine(reason) || "The transfer could not be confirmed.";
    const subject = `Payment not confirmed for ${gym}`;
    const text = [
        `Hello ${who},`,
        "",
        `We could not confirm the payment for "${gym}".`,
        why,
        "",
        "Submit the payment again from your Forma workspace:",
        appUrl,
    ].join("\n");
    const html = renderTransactionalEmail({
        preheader: "Submit the payment again from your workspace.",
        title: "Payment not confirmed",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0 0 12px;">We could not confirm the payment for <strong style="color:${NAVY};">${escapeHtml(gym)}</strong>.</p>
<p style="margin:0;">${escapeHtml(why)}</p>`,
        ctaLabel: "Open Forma",
        ctaUrl: appUrl,
        footnote: "Submit the transfer again from your workspace. Your plan does not change until a payment is confirmed.",
    });
    return { subject, text, html };
}

function accountSuspendedEmail({ name, gymName, appUrl }) {
    const who = displayName(name);
    const gym = oneLine(gymName) || "your gym";
    const subject = `${gym} is paused on Forma`;
    const text = [
        `Hello ${who},`,
        "",
        `"${gym}" is paused. Staff cannot use the workspace until it is restored.`,
        "Open Forma to review the account:",
        appUrl,
    ].join("\n");
    const html = renderTransactionalEmail({
        preheader: "The workspace is paused until it is restored.",
        title: "Workspace paused",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0;">Your gym workspace <strong style="color:${NAVY};">${escapeHtml(gym)}</strong> is paused. Staff cannot use it until the account is restored.</p>`,
        ctaLabel: "Open Forma",
        ctaUrl: appUrl,
        footnote: "If you think this was a mistake, reply to this email or contact Forma support.",
    });
    return { subject, text, html };
}

function trialEndingEmail({ name, gymName, daysLeft, appUrl }) {
    const who = displayName(name);
    const gym = oneLine(gymName) || "your gym";
    const days = Number(daysLeft) || 1;
    const when = days === 1 ? "1 day" : `${days} days`;
    const subject = `${gym} trial ends in ${when}`;
    const text = [
        `Hello ${who},`,
        "",
        `The Forma trial for "${gym}" ends in ${when}.`,
        "Choose a plan before then so the workspace stays open:",
        appUrl,
    ].join("\n");
    const html = renderTransactionalEmail({
        preheader: `The trial ends in ${when}.`,
        title: "Your trial is ending",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0;">The trial for <strong style="color:${NAVY};">${escapeHtml(gym)}</strong> ends in ${escapeHtml(when)}. Choose a plan before then so the workspace stays open.</p>`,
        ctaLabel: "Choose a plan",
        ctaUrl: appUrl,
        footnote: "If you already sent a transfer, you can ignore this note.",
    });
    return { subject, text, html };
}

function paymentReminderEmail({ name, gymName, daysLeft, appUrl }) {
    const who = displayName(name);
    const gym = oneLine(gymName) || "your gym";
    const days = Number(daysLeft) || 1;
    const when = days === 1 ? "1 day" : `${days} days`;
    const subject = `${gym} billing is due in ${when}`;
    const text = [
        `Hello ${who},`,
        "",
        `The current billing period for "${gym}" ends in ${when}.`,
        "Send the transfer so the workspace is not paused:",
        appUrl,
    ].join("\n");
    const html = renderTransactionalEmail({
        preheader: `Billing is due in ${when}.`,
        title: "Billing is due soon",
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0;">The current billing period for <strong style="color:${NAVY};">${escapeHtml(gym)}</strong> ends in ${escapeHtml(when)}. Send the transfer so the workspace is not paused.</p>`,
        ctaLabel: "Open Forma",
        ctaUrl: appUrl,
        footnote: "If you already sent a transfer, you can ignore this note.",
    });
    return { subject, text, html };
}

function campaignEmail({ name, gymName, subject, message, ctaLabel, ctaUrl }) {
    const who = displayName(name);
    const gym = oneLine(gymName) || "your gym";
    const title = oneLine(subject) || "A note from Forma";
    const body = String(message || "").trim();
    const text = [
        `Hello ${who},`,
        "",
        body,
        ctaUrl ? `\n${ctaUrl}` : "",
    ].filter((line) => line !== undefined).join("\n");
    const html = renderTransactionalEmail({
        preheader: title,
        title,
        bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(who)},</p>
<p style="margin:0 0 12px;">This note is for <strong style="color:${NAVY};">${escapeHtml(gym)}</strong>.</p>
${paragraphs(body)}`,
        ctaLabel: ctaLabel || "Open Forma",
        ctaUrl,
        footnote: "You received this because you own a gym workspace on Forma.",
    });
    return { subject: title, text, html };
}

const CAMPAIGN_TEMPLATE_KEYS = ["product_update", "offer", "win_back"];

function campaignStarter(key, { appUrl, offerUrl }) {
    const starters = {
        product_update: {
            key: "product_update",
            label: "Product update",
            subject: "What's new on Forma",
            message: "We shipped an update to your gym workspace.\n\nSign in to see what changed.",
            ctaLabel: "Open Forma",
            ctaUrl: appUrl,
        },
        offer: {
            key: "offer",
            label: "Offer",
            subject: "A Forma plan for your gym",
            message: "A billing option is available for your workspace.\n\nReview it before your current period ends.",
            ctaLabel: "View plans",
            ctaUrl: offerUrl || appUrl,
        },
        win_back: {
            key: "win_back",
            label: "Win-back",
            subject: "Your Forma workspace is ready when you are",
            message: "Your gym workspace is paused.\n\nSign in when you want to pick up where you left off.",
            ctaLabel: "Return to Forma",
            ctaUrl: appUrl,
        },
    };
    return starters[key] || null;
}

module.exports = {
    escapeHtml,
    passwordResetEmail,
    inviteEmail,
    paymentRejectedEmail,
    accountSuspendedEmail,
    trialEndingEmail,
    paymentReminderEmail,
    campaignEmail,
    CAMPAIGN_TEMPLATE_KEYS,
    campaignStarter,
};
