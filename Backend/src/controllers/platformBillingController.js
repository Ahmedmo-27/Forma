const ManualPayment = require("../models/ManualPayment");
const Invoice = require("../models/Invoice");
const BillingEvent = require("../models/BillingEvent");
const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const AuditLog = require("../models/AuditLog");
const billingService = require("../services/billing/billingService");
const invoiceService = require("../services/invoiceService");
const { runAsPlatform } = require("../context/tenantContext");
const logger = require("../utils/logger");

// ==========================================
// 1. Manual Payments Inbox
// ==========================================

async function getPendingPayments(req, res) {
    try {
        const { status = "pending" } = req.query;
        const payments = await ManualPayment.find({ status })
            .populate("tenantId", "name slug")
            .populate("submittedBy", "name email")
            .populate("reviewedBy", "name email")
            .sort({ createdAt: -1 });

        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function confirmPayment(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: "Mandatory 'reason' required to confirm payment" });
        }

        const payment = await ManualPayment.findById(id).populate("tenantId");
        if (!payment) return res.status(404).json({ message: "Payment submission not found" });

        if (payment.status === "confirmed") {
            return res.status(400).json({ message: "Payment has already been confirmed" });
        }

        const tenant = payment.tenantId;

        let billingEvent;
        if (payment.cycle === "lifetime") {
            // Transactional lifetime confirmation
            const result = await billingService.confirmLifetimePurchase({
                paymentRef: payment.paymentRef,
                actorId: req.platformUser.id,
                actorType: "PlatformAdmin",
                paymentMethod: "manual_transfer",
            });
            billingEvent = result.billingEvent;
        } else {
            // Recurring confirmation
            const now = new Date();
            const months = payment.cycle === "yearly" ? 12 : 1;
            tenant.status = "active";
            tenant.billing.cycle = payment.cycle;
            tenant.currentPeriodEnd = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
            await tenant.save();

            const createdEvents = await BillingEvent.create([
                {
                    tenantId: tenant._id,
                    type: "purchase",
                    planKey: payment.planKey,
                    cycle: payment.cycle,
                    amount: payment.amount,
                    currency: payment.currency,
                    actorId: req.platformUser.id,
                    actorType: "PlatformAdmin",
                    externalRef: payment.paymentRef,
                    meta: { confirmedBy: req.platformUser.email, reason },
                },
            ]);
            billingEvent = createdEvents[0];
        }

        // Generate sequential PDF/HTML Invoice
        const invoice = await invoiceService.createInvoiceForPayment({
            tenant,
            planKey: payment.planKey,
            cycle: payment.cycle,
            amount: payment.amount,
            currency: payment.currency,
            paymentRef: payment.paymentRef,
            paymentMethod: "manual_transfer",
            billingEventId: billingEvent?._id || null,
        });

        // Mark payment submission confirmed
        payment.status = "confirmed";
        payment.reviewedBy = req.platformUser.id;
        payment.reviewedAt = new Date();
        await payment.save();

        res.json({
            message: "Payment confirmed and invoice issued successfully",
            invoiceNumber: invoice.invoiceNumber,
            payment,
        });
    } catch (err) {
        logger.error("platform", "confirmPayment error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function rejectPayment(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: "Mandatory 'reason' required to reject payment" });
        }

        const payment = await ManualPayment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        payment.status = "rejected";
        payment.rejectReason = reason.trim();
        payment.reviewedBy = req.platformUser.id;
        payment.reviewedAt = new Date();
        await payment.save();

        res.json({ message: "Payment rejected", payment });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 2. Invoices
// ==========================================

async function getInvoices(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const { search, tenantId, status } = req.query;
        const filter = {};
        if (tenantId) filter.tenantId = tenantId;
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { invoiceNumber: new RegExp(search.trim(), "i") },
                { "buyerDetails.tenantName": new RegExp(search.trim(), "i") },
                { "buyerDetails.tenantSlug": new RegExp(search.trim(), "i") },
            ];
        }

        const [invoices, total] = await Promise.all([
            Invoice.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(limit),
            Invoice.countDocuments(filter),
        ]);

        res.json({
            invoices,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function downloadInvoice(req, res) {
    try {
        const { id } = req.params;
        const invoice = await Invoice.findById(id);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });

        const html = invoiceService.renderInvoiceHtml(invoice);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 3. Refunds & License Revocation
// ==========================================

async function processRefund(req, res) {
    try {
        const { tenantId, amount, reason, revokeLifetimeIfApplicable = false } = req.body;
        if (!tenantId || amount == null || !reason || !reason.trim()) {
            return res.status(400).json({ message: "tenantId, amount, and mandatory 'reason' are required" });
        }

        const tenant = await Tenant.findById(tenantId).populate("planId");
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const isLifetime = tenant.billing?.cycle === "lifetime";

        if (isLifetime && revokeLifetimeIfApplicable) {
            await billingService.revokeLifetime({
                tenantId: tenant._id,
                reason,
                actorId: req.platformUser.id,
                refundAmount: Number(amount),
            });
            return res.json({ message: "Lifetime subscription refunded and revoked successfully" });
        }

        // Standard refund record
        const refundAmount = Number(amount);
        const billingEvent = await BillingEvent.create({
            tenantId: tenant._id,
            type: "refund",
            planKey: tenant.planId?.key || "basic",
            cycle: tenant.billing?.cycle || "monthly",
            amount: refundAmount,
            currency: tenant.settings?.locale?.currency || "USD",
            actorId: req.platformUser.id,
            actorType: "PlatformAdmin",
            meta: { reason, refundedBy: req.platformUser.email },
        });

        await AuditLog.create({
            tenantId: tenant._id,
            action: "tenant_status_updated",
            actor: req.platformUser.id,
            actorRole: "PlatformUser",
            targetType: "tenant",
            targetId: tenant._id.toString(),
            meta: { action: "refund_processed", amount: refundAmount, reason },
        });

        res.json({ message: "Refund processed successfully", billingEvent });
    } catch (err) {
        logger.error("platform", "processRefund error", { error: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 4. Manual Subscription Grants
// ==========================================

async function issueManualGrant(req, res) {
    try {
        const { tenantId, planKey, cycle = "monthly", durationMonths = 1, reason } = req.body;
        if (!tenantId || !planKey || !reason || !reason.trim()) {
            return res.status(400).json({ message: "tenantId, planKey, and mandatory 'reason' are required" });
        }

        const tenant = await Tenant.findById(tenantId);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const plan = await Plan.findOne({ key: planKey });
        if (!plan) return res.status(400).json({ message: "Plan not found" });

        if (cycle === "lifetime") {
            const result = await billingService.grantLifetimeManually({
                tenantId: tenant._id,
                planKey,
                reason,
                actorId: req.platformUser.id,
            });
            return res.json({ message: "Lifetime subscription granted manually", result });
        }

        // Recurring complementary grant
        const now = new Date();
        tenant.status = "active";
        tenant.planId = plan._id;
        tenant.billing.cycle = cycle;
        tenant.currentPeriodEnd = new Date(now.getTime() + Number(durationMonths) * 30 * 24 * 60 * 60 * 1000);
        await tenant.save();

        const billingEvent = await BillingEvent.create({
            tenantId: tenant._id,
            type: "manual_grant",
            planKey: plan.key,
            cycle,
            amount: 0,
            currency: "USD",
            actorId: req.platformUser.id,
            actorType: "PlatformAdmin",
            meta: { reason, durationMonths, grantedBy: req.platformUser.email },
        });

        res.json({ message: "Complimentary grant issued successfully", tenant, billingEvent });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

// ==========================================
// 5. Append-Only Financial Ledger Explorer
// ==========================================

async function getLedgerEvents(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;

        const { tenantId, type, fromDate, toDate } = req.query;
        const filter = {};
        if (tenantId) filter.tenantId = tenantId;
        if (type) filter.type = type;
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const [events, total] = await Promise.all([
            BillingEvent.find(filter)
                .populate("tenantId", "name slug")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            BillingEvent.countDocuments(filter),
        ]);

        res.json({
            events,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function exportLedgerCsv(req, res) {
    try {
        const { tenantId, type, fromDate, toDate } = req.query;
        const filter = {};
        if (tenantId) filter.tenantId = tenantId;
        if (type) filter.type = type;
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const events = await BillingEvent.find(filter).populate("tenantId", "name slug").sort({ createdAt: -1 });

        let csv = "ID,Date,Tenant Slug,Tenant Name,Type,Plan,Cycle,Amount,Currency,Actor,Payment Ref,Reason\n";
        for (const e of events) {
            const dateStr = new Date(e.createdAt).toISOString();
            const tenantSlug = e.tenantId?.slug || "";
            const tenantName = `"${(e.tenantId?.name || "").replace(/"/g, '""')}"`;
            const reason = `"${(e.meta?.reason || "").replace(/"/g, '""')}"`;
            csv += `${e._id},${dateStr},${tenantSlug},${tenantName},${e.type},${e.planKey},${e.cycle},${e.amount},${e.currency},${e.actorType},${e.externalRef || ""},${reason}\n`;
        }

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="billing-ledger.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

module.exports = {
    getPendingPayments,
    confirmPayment,
    rejectPayment,
    getInvoices,
    downloadInvoice,
    processRefund,
    issueManualGrant,
    getLedgerEvents,
    exportLedgerCsv,
};
