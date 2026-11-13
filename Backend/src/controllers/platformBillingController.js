const ManualPayment = require("../models/ManualPayment");
const Invoice = require("../models/Invoice");
const BillingEvent = require("../models/BillingEvent");
const Tenant = require("../models/Tenant");
const Plan = require("../models/Plan");
const AuditLog = require("../models/AuditLog");
const billingService = require("../services/billing/billingService");
const invoiceService = require("../services/invoiceService");
const { runAsPlatform } = require("../context/tenantContext");
const { parsePagination, buildPagination } = require("../utils/pagination");
const logger = require("../utils/logger");
const User = require("../models/User");
const mailer = require("../services/mailer");
const { BILLING_CURRENCY } = require("../config/currency");

// ==========================================
// 1. Manual Payments Inbox
// ==========================================

async function getPendingPayments(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const { status = "pending", tenantId, search } = req.query || {};

        const filter = {};
        if (status) filter.status = status;
        if (tenantId) filter.tenantId = tenantId;
        if (search && search.trim()) {
            filter.$or = [
                { paymentRef: new RegExp(search.trim(), "i") },
                { notes: new RegExp(search.trim(), "i") },
            ];
        }

        const [payments, total] = await Promise.all([
            ManualPayment.find(filter)
                .populate("tenantId", "name slug")
                .populate("submittedBy", "name email")
                .populate("reviewedBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ManualPayment.countDocuments(filter),
        ]);

        res.json({
            payments,
            pagination: buildPagination(page, limit, total),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

async function confirmPayment(req, res) {
    return runAsPlatform(async () => {
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
                return res.status(400).json({
                    code: "LIFETIME_DISABLED",
                    message: "Lifetime subscriptions are no longer available. Reject or refund this payment manually.",
                });
            } else {
                const now = new Date();
                const intervalCount = billingService.normalizeIntervalCount(payment.intervalCount);
                const months = billingService.periodMonths(payment.cycle, intervalCount);
                tenant.status = "active";
                tenant.billing.cycle = payment.cycle;
                tenant.billing.intervalCount = intervalCount;
                tenant.currentPeriodEnd = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
                await tenant.save();

                const createdEvents = await BillingEvent.create([
                    {
                        tenantId: tenant._id,
                        type: "purchase",
                        planKey: payment.planKey,
                        cycle: payment.cycle,
                        intervalCount,
                        amount: payment.amount,
                        currency: BILLING_CURRENCY,
                        actorId: req.platformUser.id,
                        actorType: "PlatformAdmin",
                        externalRef: payment.paymentRef,
                        meta: { confirmedBy: req.platformUser.email, reason },
                    },
                ]);
                billingEvent = createdEvents[0];
            }

            const invoice = await invoiceService.createInvoiceForPayment({
                tenant,
                planKey: payment.planKey,
                cycle: payment.cycle,
                amount: payment.amount,
                currency: BILLING_CURRENCY,
                paymentRef: payment.paymentRef,
                paymentMethod: "manual_transfer",
                billingEventId: billingEvent?._id || null,
            });

            payment.status = "confirmed";
            payment.currency = BILLING_CURRENCY;
            payment.reviewedBy = req.platformUser.id;
            payment.reviewedAt = new Date();
            await payment.save();

            try {
                let ownerEmail = invoice.buyerDetails?.ownerEmail;
                if (!ownerEmail && tenant.ownerUserId) {
                    const ownerId = tenant.ownerUserId._id || tenant.ownerUserId;
                    const owner = await User.findById(ownerId).select("email");
                    ownerEmail = owner?.email;
                }
                if (ownerEmail) {
                    await mailer.sendInvoiceEmail({
                        to: ownerEmail,
                        invoiceNumber: invoice.invoiceNumber,
                        html: invoiceService.renderInvoiceHtml(invoice),
                    });
                }
            } catch (mailErr) {
                logger.warn("platform", "Invoice email failed", { error: mailErr.message });
            }

            res.json({
                message: "Payment confirmed and invoice issued successfully",
                invoiceNumber: invoice.invoiceNumber,
                payment,
            });
        } catch (err) {
            logger.error("platform", "confirmPayment error", { error: err.message });
            res.status(500).json({ message: "Server error", error: err.message });
        }
    }, { actorId: req.platformUser?.id, reason: "confirm_manual_payment" });
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

        const ownerMail = require("../services/ownerMail");
        await ownerMail.notifyPaymentRejected(payment, payment.rejectReason);

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
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
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
            pagination: buildPagination(page, limit, total),
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
    return runAsPlatform(async () => {
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
                currency: BILLING_CURRENCY,
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
    }, { actorId: req.platformUser?.id, reason: "process_refund" });
}

async function issueManualGrant(req, res) {
    return runAsPlatform(async () => {
        try {
            const {
                tenantId,
                planKey,
                cycle = "monthly",
                intervalCount: rawIntervalCount,
                durationMonths = 1,
                reason,
            } = req.body;
            if (!tenantId || !planKey || !reason || !reason.trim()) {
                return res.status(400).json({ message: "tenantId, planKey, and mandatory 'reason' are required" });
            }

            const tenant = await Tenant.findById(tenantId);
            if (!tenant) return res.status(404).json({ message: "Tenant not found" });

            const plan = await Plan.findOne({ key: planKey });
            if (!plan) return res.status(400).json({ message: "Plan not found" });

            if (cycle === "lifetime") {
                return res.status(400).json({
                    code: "LIFETIME_DISABLED",
                    message: "Lifetime subscriptions are no longer available",
                });
            }

            const intervalCount = billingService.normalizeIntervalCount(
                rawIntervalCount != null ? rawIntervalCount : durationMonths
            );

            // Recurring complementary grant
            const now = new Date();
            tenant.status = "active";
            tenant.planId = plan._id;
            tenant.billing.cycle = cycle;
            tenant.billing.intervalCount = intervalCount;
            tenant.currentPeriodEnd = new Date(now.getTime() + Number(durationMonths) * 30 * 24 * 60 * 60 * 1000);
            await tenant.save();

            const billingEvent = await BillingEvent.create({
                tenantId: tenant._id,
                type: "manual_grant",
                planKey: plan.key,
                cycle,
                intervalCount,
                amount: 0,
                currency: BILLING_CURRENCY,
                actorId: req.platformUser.id,
                actorType: "PlatformAdmin",
                meta: { reason, durationMonths, grantedBy: req.platformUser.email },
            });

            res.json({ message: "Complimentary grant issued successfully", tenant, billingEvent });
        } catch (err) {
            res.status(500).json({ message: "Server error", error: err.message });
        }
    }, { actorId: req.platformUser?.id, reason: "issue_manual_grant" });
}

// ==========================================
// 5. Append-Only Financial Ledger Explorer
// ==========================================

async function getLedgerEvents(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25 });

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
            pagination: buildPagination(page, limit, total),
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
            csv += `${e._id},${dateStr},${tenantSlug},${tenantName},${e.type},${e.planKey},${e.cycle},${e.amount},${BILLING_CURRENCY},${e.actorType},${e.externalRef || ""},${reason}\n`;
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
