import React, { useState, useEffect } from "react";
import {
  getPendingPayments,
  confirmPayment,
  rejectPayment,
  getInvoices,
  processRefund,
  issueManualGrant,
} from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import ConfirmActionModal from "../components/ConfirmActionModal";
import toast from "react-hot-toast";

export default function PlatformPaymentsInvoices() {
  const [tab, setTab] = useState("payments"); // 'payments' | 'invoices' | 'grants'
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [actionModal, setActionModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    confirmVariant: "primary",
    onConfirm: null,
  });

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const [grantForm, setGrantForm] = useState({
    tenantId: "",
    planId: "",
    billingCycle: "monthly",
    durationMonths: 1,
    reason: "",
  });

  const [refundForm, setRefundForm] = useState({
    paymentId: "",
    amount: "",
    reason: "",
  });

  const loadPayments = async () => {
    try {
      setLoading(true);
      const res = await getPendingPayments();
      setPayments(res.data?.payments || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const res = await getInvoices();
      setInvoices(res.data?.invoices || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "payments") loadPayments();
    if (tab === "invoices") loadInvoices();
  }, [tab]);

  const handleConfirmPayment = (p) => {
    setActionModal({
      isOpen: true,
      title: `Confirm Payment for ${p.tenantId?.name || p.tenantId}`,
      message: `Are you sure you want to approve this payment of ${p.amount} ${p.currency}? This will activate or renew the tenant's subscription.`,
      confirmLabel: "Approve Payment",
      confirmVariant: "primary",
      onConfirm: async (reason) => {
        try {
          await confirmPayment(p._id, { reason });
          toast.success("Payment confirmed successfully");
          setActionModal((prev) => ({ ...prev, isOpen: false }));
          loadPayments();
        } catch (err) {
          toast.error(err.response?.data?.message || "Confirmation failed");
        }
      },
    });
  };

  const handleRejectPayment = (p) => {
    setActionModal({
      isOpen: true,
      title: `Reject Payment for ${p.tenantId?.name || p.tenantId}`,
      message: `Rejecting payment of ${p.amount} ${p.currency}. Provide a clear reason for audit and tenant communication.`,
      confirmLabel: "Reject Payment",
      confirmVariant: "danger",
      onConfirm: async (reason) => {
        try {
          await rejectPayment(p._id, { reason });
          toast.success("Payment marked as rejected");
          setActionModal((prev) => ({ ...prev, isOpen: false }));
          loadPayments();
        } catch (err) {
          toast.error(err.response?.data?.message || "Rejection failed");
        }
      },
    });
  };

  const handleCreateGrant = async (e) => {
    e.preventDefault();
    if (!grantForm.reason.trim()) {
      return toast.error("Audit reason is strictly mandatory");
    }
    try {
      await issueManualGrant(grantForm);
      toast.success("Manual grant issued successfully");
      setShowGrantModal(false);
      setGrantForm({ tenantId: "", planId: "", billingCycle: "monthly", durationMonths: 1, reason: "" });
    } catch (err) {
      toast.error(err.response?.data?.message || "Grant creation failed");
    }
  };

  const handleProcessRefund = async (e) => {
    e.preventDefault();
    if (!refundForm.reason.trim()) {
      return toast.error("Audit reason is strictly mandatory");
    }
    try {
      await processRefund(refundForm);
      toast.success("Refund processed and ledger updated");
      setShowRefundModal(false);
      setRefundForm({ paymentId: "", amount: "", reason: "" });
    } catch (err) {
      toast.error(err.response?.data?.message || "Refund processing failed");
    }
  };

  const paymentColumns = [
    {
      header: "Tenant",
      render: (p) => (
        <div>
          <span className="font-semibold text-white">{p.tenantId?.name || p.tenantName || p.tenantId}</span>
          <p className="text-xs text-slate-400 font-mono">{p.tenantId?.slug || ""}</p>
        </div>
      ),
    },
    {
      header: "Plan & Cycle",
      render: (p) => (
        <div>
          <span className="text-xs font-medium text-purple-300">{p.planName || p.planId?.name || "Standard"}</span>
          <p className="text-xs text-slate-400 capitalize">{p.billingCycle || "Monthly"}</p>
        </div>
      ),
    },
    {
      header: "Amount",
      render: (p) => (
        <span className="font-mono font-semibold text-emerald-400">
          {p.amount?.toLocaleString()} {p.currency || "EGP"}
        </span>
      ),
    },
    {
      header: "Method / Ref",
      render: (p) => (
        <div>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 capitalize">
            {p.paymentMethod || "Bank Transfer"}
          </span>
          {p.referenceNumber && (
            <p className="text-xs font-mono text-slate-400 mt-1">Ref: {p.referenceNumber}</p>
          )}
        </div>
      ),
    },
    {
      header: "Proof Attachment",
      render: (p) =>
        p.proofUrl ? (
          <a
            href={p.proofUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1"
          >
            <span>📎 View Proof</span>
          </a>
        ) : (
          <span className="text-xs text-slate-500">None attached</span>
        ),
    },
    {
      header: "Status",
      render: (p) => (
        <span
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
            p.status === "confirmed"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : p.status === "rejected"
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          {p.status || "Pending"}
        </span>
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          {(!p.status || p.status === "pending") && (
            <>
              <button
                onClick={() => handleConfirmPayment(p)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => handleRejectPayment(p)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition-colors"
              >
                Reject
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const invoiceColumns = [
    {
      header: "Invoice #",
      render: (i) => <span className="font-mono text-purple-400 font-semibold">{i.invoiceNumber}</span>,
    },
    {
      header: "Tenant",
      render: (i) => (
        <div>
          <span className="font-semibold text-white">{i.tenantId?.name || i.tenantName}</span>
          <p className="text-xs text-slate-400">{i.tenantId?.slug}</p>
        </div>
      ),
    },
    {
      header: "Total",
      render: (i) => (
        <span className="font-mono font-semibold text-white">
          {i.amountPaid?.toLocaleString() || i.total?.toLocaleString()} {i.currency}
        </span>
      ),
    },
    {
      header: "Status",
      render: (i) => (
        <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
          {i.status || "Paid"}
        </span>
      ),
    },
    {
      header: "Date",
      render: (i) => (
        <span className="text-xs text-slate-400">
          {i.issuedAt ? new Date(i.issuedAt).toLocaleDateString() : new Date(i.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (i) => (
        <a
          href={`/api/platform/billing/invoices/${i._id}/download`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded border border-purple-500/30 inline-flex items-center gap-1.5"
        >
          <span>📄 View PDF/HTML</span>
        </a>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payments & Invoicing</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manual bank review inbox, sequential invoicing engine, refunds, and grants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrantModal(true)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30 transition-all flex items-center gap-1.5"
          >
            <span>+ Manual Grant</span>
          </button>
          <button
            onClick={() => setShowRefundModal(true)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1.5"
          >
            <span>↩ Process Refund</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-4">
        <button
          onClick={() => setTab("payments")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            tab === "payments"
              ? "border-purple-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Pending Payments Inbox
        </button>
        <button
          onClick={() => setTab("invoices")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            tab === "invoices"
              ? "border-purple-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Sequential Invoices
        </button>
      </div>

      {/* Content */}
      {tab === "payments" ? (
        <PlatformDataTable
          columns={paymentColumns}
          data={payments}
          isLoading={loading}
          emptyMessage="No pending manual payments waiting for review."
        />
      ) : (
        <PlatformDataTable
          columns={invoiceColumns}
          data={invoices}
          isLoading={loading}
          emptyMessage="No invoices generated yet."
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmActionModal
        isOpen={actionModal.isOpen}
        title={actionModal.title}
        message={actionModal.message}
        confirmLabel={actionModal.confirmLabel}
        confirmVariant={actionModal.confirmVariant}
        onCancel={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={actionModal.onConfirm}
      />

      {/* Manual Grant Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Issue Manual Grant</h3>
            <p className="text-xs text-slate-400 mb-4">
              Grant complimentary service or partner extensions. Requires mandatory audit reason.
            </p>
            <form onSubmit={handleCreateGrant} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tenant ID</label>
                <input
                  type="text"
                  required
                  placeholder="65a7f..."
                  value={grantForm.tenantId}
                  onChange={(e) => setGrantForm({ ...grantForm, tenantId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Plan ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="Leave empty for current"
                    value={grantForm.planId}
                    onChange={(e) => setGrantForm({ ...grantForm, planId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cycle</label>
                  <select
                    value={grantForm.billingCycle}
                    onChange={(e) => setGrantForm({ ...grantForm, billingCycle: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Duration (Months)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={grantForm.durationMonths}
                  onChange={(e) => setGrantForm({ ...grantForm, durationMonths: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Audit Reason <span className="text-amber-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., Strategic launch partner agreement Q1"
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGrantModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Issue Grant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Process Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Process Refund</h3>
            <p className="text-xs text-slate-400 mb-4">
              Refunds append a reversal in the BillingEvent ledger and trigger entitlement revocation for lifetime licenses.
            </p>
            <form onSubmit={handleProcessRefund} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Payment / Event ID</label>
                <input
                  type="text"
                  required
                  placeholder="65a7f..."
                  value={refundForm.paymentId}
                  onChange={(e) => setRefundForm({ ...refundForm, paymentId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Refund Amount (Optional, blank for full)</label>
                <input
                  type="number"
                  placeholder="Full amount if empty"
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Audit Reason <span className="text-amber-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., Customer requested 14-day money-back guarantee"
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
                >
                  Confirm Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
