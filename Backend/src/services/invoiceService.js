const PlatformCounter = require("../models/PlatformCounter");
const Invoice = require("../models/Invoice");
const PlatformSetting = require("../models/PlatformSetting");
const { BILLING_CURRENCY } = require("../config/currency");

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

    const invoice = await Invoice.create({
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
        buyerDetails: {
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            ownerName: tenant.ownerUserId?.name || "",
            ownerEmail: tenant.ownerUserId?.email || "",
        },
        status: "paid",
        issuedAt: new Date(),
    });

    return invoice;
}

/**
 * Render clean HTML for the invoice receipt
 */
function renderInvoiceHtml(invoice) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1e293b; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
        .title { font-size: 28px; font-weight: bold; color: #4338ca; }
        .badge { display: inline-block; padding: 4px 12px; background: #dcfce7; color: #166534; font-weight: bold; border-radius: 9999px; text-transform: uppercase; font-size: 12px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin: 30px 0; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table th { background: #f8fafc; text-align: left; padding: 12px; border-bottom: 2px solid #cbd5e1; }
        .table td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .total-box { margin-top: 30px; text-align: right; }
        .total-amount { font-size: 24px; font-weight: bold; color: #0f172a; }
        .footer { margin-top: 60px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">Forma</div>
            <div>${invoice.sellerDetails.name}</div>
            <div>Tax ID: ${invoice.sellerDetails.taxId}</div>
            <div>${invoice.sellerDetails.address}</div>
            <div>${invoice.sellerDetails.supportEmail}</div>
        </div>
        <div style="text-align: right;">
            <h2>INVOICE</h2>
            <div style="font-size: 18px; font-weight: bold;">${invoice.invoiceNumber}</div>
            <div style="margin-top: 8px;"><span class="badge">${invoice.status}</span></div>
            <div style="margin-top: 8px; font-size: 13px; color: #64748b;">Issued: ${new Date(invoice.issuedAt).toLocaleDateString()}</div>
        </div>
    </div>

    <div class="meta-grid">
        <div>
            <h4 style="margin-bottom: 8px; color: #64748b; text-transform: uppercase; font-size: 12px;">Billed To:</h4>
            <strong>${invoice.buyerDetails.tenantName}</strong> (${invoice.buyerDetails.tenantSlug})<br>
            ${invoice.buyerDetails.ownerName ? `Attn: ${invoice.buyerDetails.ownerName}<br>` : ""}
            ${invoice.buyerDetails.ownerEmail ? `Email: ${invoice.buyerDetails.ownerEmail}<br>` : ""}
        </div>
        <div>
            <h4 style="margin-bottom: 8px; color: #64748b; text-transform: uppercase; font-size: 12px;">Payment Details:</h4>
            Method: <strong>${invoice.paymentMethod.replace("_", " ").toUpperCase()}</strong><br>
            Ref: <code>${invoice.paymentRef || "N/A"}</code><br>
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
                <td><strong>${invoice.planKey.toUpperCase()} Plan Subscription</strong></td>
                <td>${invoice.cycle.toUpperCase()}</td>
                <td style="text-align: right;">${invoice.amount.toLocaleString()} ${invoice.currency}</td>
            </tr>
        </tbody>
    </table>

    <div class="total-box">
        <div style="color: #64748b;">Total Paid:</div>
        <div class="total-amount">${invoice.amount.toLocaleString()} ${invoice.currency}</div>
    </div>

    <div class="footer">
        Thank you for choosing Forma.<br>
        Questions? Contact ${invoice.sellerDetails.supportEmail}
    </div>
</body>
</html>`;
}

module.exports = {
    getNextInvoiceNumber,
    createInvoiceForPayment,
    renderInvoiceHtml,
};
