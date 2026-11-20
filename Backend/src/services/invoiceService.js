const PlatformCounter = require("../models/PlatformCounter");
const Invoice = require("../models/Invoice");
const PlatformSetting = require("../models/PlatformSetting");
const { BILLING_CURRENCY } = require("../config/currency");
const { runAsPlatform, isPlatformContext } = require("../context/tenantContext");

/**
 * Atomically generates the next sequential platform invoice number.
 * Format: INV-YYYY-XXXX (e.g. INV-2026-0001)
 */
async function getNextInvoiceNumber() {
    const year = new Date().getFullYear();
    const counterName = `invoice_${year}`;

    const counter = await PlatformCounter.findOneAndUpdate(
        { name: counterName },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    const formattedSeq = String(counter.seq).padStart(4, "0");
    return `INV-${year}-${formattedSeq}`;
}

function formatBillingAddress(profile = {}) {
    const cityLine = [profile.city, profile.region, profile.postalCode].filter(Boolean).join(", ");
    return [profile.addressLine1, profile.addressLine2, cityLine, profile.country].filter(Boolean).join("\n");
}

/** Buyer block for an invoice, snapshotting the gym's billing profile. */
function buyerDetailsFor(tenant) {
    const profile = tenant.billingProfile?.toObject?.() || tenant.billingProfile || {};
    return {
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        ownerName: tenant.ownerUserId?.name || "",
        ownerEmail: tenant.ownerUserId?.email || "",
        legalName: profile.legalName || "",
        taxNumber: profile.taxNumber || "",
        commercialRegistration: profile.commercialRegistration || "",
        address: formatBillingAddress(profile),
        billingEmail: profile.billingEmail || "",
        phone: profile.phone || "",
    };
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Creates an immutable Invoice document tied to a completed payment.
 */
async function createInvoiceForPayment({
    tenant,
    planKey,
    cycle,
    amount,
    paymentRef,
    paymentMethod = "manual_transfer",
    billingEventId = null,
}) {
    const invoiceNumber = await getNextInvoiceNumber();

    const sellerSetting = await PlatformSetting.findOne({ key: "seller_details" });
    const storedSeller = sellerSetting?.value || {};
    const sellerDetails = {
        name: storedSeller.name || storedSeller.companyName || "Forma",
        taxId: storedSeller.taxId || "EG-TAX-10293847",
        address: storedSeller.address || "Zamalek, Cairo, Egypt",
        supportEmail: storedSeller.supportEmail || storedSeller.billingEmail || "billing@forma.app",
    };

    const payload = {
        invoiceNumber,
        tenantId: tenant._id,
        billingEventId,
        amount,
        currency: BILLING_CURRENCY,
        planKey,
        cycle,
        paymentRef,
        paymentMethod,
        sellerDetails,
        buyerDetails: buyerDetailsFor(tenant),
        status: "paid",
        issuedAt: new Date(),
    };

    // Invoice uses tenantPlugin; platform billing may call this outside ALS.
    const invoice = isPlatformContext()
        ? await Invoice.create(payload)
        : await runAsPlatform(() => Invoice.create(payload), { reason: "create_invoice" });

    return invoice;
}

/**
 * Render clean HTML for the invoice receipt
 */
function renderInvoiceHtml(invoice) {
    const e = escapeHtml;
    const seller = invoice.sellerDetails || {};
    const buyer = invoice.buyerDetails || {};
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice ${e(invoice.invoiceNumber)}</title>
    <style>
        body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #FCF3E2; color: #142843; }
        .sheet { max-width: 720px; margin: 32px auto; background: #ffffff; border: 1px solid #E6DCC8; border-radius: 12px; padding: 40px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #E6DCC8; padding-bottom: 20px; }
        .title { font-size: 28px; font-weight: bold; letter-spacing: 0.18em; color: #142843; }
        .badge { display: inline-block; padding: 4px 12px; background: #F6EDDC; color: #142843; font-weight: bold; border-radius: 9999px; text-transform: uppercase; font-size: 12px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin: 30px 0; font-family: Arial, Helvetica, sans-serif; color: #3E5168; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; font-family: Arial, Helvetica, sans-serif; }
        .table th { background: #F6EDDC; text-align: left; padding: 12px; border-bottom: 2px solid #E6DCC8; color: #142843; }
        .table td { padding: 12px; border-bottom: 1px solid #E6DCC8; color: #3E5168; }
        .total-box { margin-top: 30px; text-align: right; font-family: Arial, Helvetica, sans-serif; }
        .total-amount { font-size: 24px; font-weight: bold; color: #142843; }
        .footer { margin-top: 60px; font-size: 12px; color: #5C6E84; text-align: center; border-top: 1px solid #E6DCC8; padding-top: 20px; font-family: Arial, Helvetica, sans-serif; }
    </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
        <div>
            <img src="cid:forma-logo.png" width="40" height="40" alt="Forma" style="display:block;border:0;border-radius:10px;width:40px;height:40px;margin-bottom:12px;">
            <div class="title">FORMA</div>
            <div>${e(seller.name)}</div>
            <div>Tax ID: ${e(seller.taxId)}</div>
            <div>${e(seller.address)}</div>
            <div>${e(seller.supportEmail)}</div>
        </div>
        <div style="text-align: right;">
            <h2>INVOICE</h2>
            <div style="font-size: 18px; font-weight: bold;">${e(invoice.invoiceNumber)}</div>
            <div style="margin-top: 8px;"><span class="badge">${e(invoice.status)}</span></div>
            <div style="margin-top: 8px; font-size: 13px; color: #5C6E84;">Issued: ${e(new Date(invoice.issuedAt).toLocaleDateString())}</div>
        </div>
    </div>

    <div class="meta-grid">
        <div>
            <h4 style="margin-bottom: 8px; color: #5C6E84; text-transform: uppercase; font-size: 12px;">Billed To:</h4>
            <strong>${e(buyer.legalName || buyer.tenantName)}</strong>${buyer.legalName && buyer.legalName !== buyer.tenantName ? ` (trading as ${e(buyer.tenantName)})` : ""}<br>
            ${buyer.taxNumber ? `Tax registration no.: ${e(buyer.taxNumber)}<br>` : ""}
            ${buyer.commercialRegistration ? `Commercial registration: ${e(buyer.commercialRegistration)}<br>` : ""}
            ${buyer.address ? `${e(buyer.address).replace(/\n/g, "<br>")}<br>` : ""}
            ${buyer.ownerName ? `Attn: ${e(buyer.ownerName)}<br>` : ""}
            ${buyer.billingEmail || buyer.ownerEmail ? `Email: ${e(buyer.billingEmail || buyer.ownerEmail)}<br>` : ""}
            ${buyer.phone ? `Phone: ${e(buyer.phone)}<br>` : ""}
        </div>
        <div>
            <h4 style="margin-bottom: 8px; color: #5C6E84; text-transform: uppercase; font-size: 12px;">Payment Details:</h4>
            Method: <strong>${e(String(invoice.paymentMethod || "").replace("_", " ").toUpperCase())}</strong><br>
            Ref: <code>${e(invoice.paymentRef || "N/A")}</code><br>
        </div>
    </div>

    <table class="table">
        <thead>
            <tr>
                <th>Description</th>
                <th>Billing Cycle</th>
                <th style="text-align: right;">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>${e(String(invoice.planKey || "").toUpperCase())} Plan Subscription</strong></td>
                <td>${e(String(invoice.cycle || "").toUpperCase())}</td>
                <td style="text-align: right;">${e(Number(invoice.amount || 0).toLocaleString())} ${e(invoice.currency)}</td>
            </tr>
        </tbody>
    </table>

    <div class="total-box">
        <div style="color: #5C6E84;">Total Paid:</div>
        <div class="total-amount">${e(Number(invoice.amount || 0).toLocaleString())} ${e(invoice.currency)}</div>
    </div>

    <div class="footer">
        Thank you for choosing Forma.<br>
        Questions? Contact ${e(seller.supportEmail)}
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
    buyerDetailsFor,
    escapeHtml,
    getNextInvoiceNumber,
    createInvoiceForPayment,
    renderInvoiceHtml,
};
